import fs from 'fs'
import path from 'path'

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { program } from 'commander'

import '../../../config/loadEnv'
import connectDB from '../../../config/db'
import Expense from '../../../models/Expense'
import documentUpload from '../../../services/documentUpload'
import { extractInvoice } from '../../../services/invoiceExtraction/extract'
import { scoreRecord, FieldScore } from './scoring'

program
  .requiredOption(
    '--tenant-id <id>',
    'tenantId to sample Expense fixtures from (required - never run this against unscoped/production-wide data)',
  )
  .option('--limit <n>', 'number of Expense records to sample', '20')
program.parse(process.argv)
const { tenantId, limit } = program.opts<{ tenantId: string; limit: string }>()

interface ExpenseFixture {
  _id: string
  expenseFile: string
  expenseDate: Date
  info?: string
  contactName?: string
  tax?: number
  taxLow?: number
  price?: number
}

function resolveS3Key(expenseFile: string): string {
  // Some historical records store the bare S3 key; others store the
  // "/api/document/<key>" path returned by documentsService.uploadDocument().
  return expenseFile.replace(/^\/api\/document\//, '')
}

function inferMimeType(key: string): 'image/jpeg' | 'image/png' | null {
  const lower = key.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  return null
}

async function fetchImageBuffer(key: string): Promise<Buffer> {
  const response = await documentUpload.s3Client.send(
    new GetObjectCommand({ Bucket: documentUpload.bucketName, Key: key }),
  )
  const chunks: Buffer[] = []
  const body = response.Body as NodeJS.ReadableStream
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function run(): Promise<void> {
  await connectDB()

  const fixtures = (await Expense.find({
    tenantId,
    expenseFile: { $exists: true, $ne: '' },
  })
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .lean()) as unknown as ExpenseFixture[]

  console.log(
    `Loaded ${fixtures.length} Expense fixtures for tenant ${tenantId} (limit=${limit})`,
  )

  const allScores: FieldScore[] = []
  const perRecord: Array<{
    id: string
    status: string
    scores?: FieldScore[]
  }> = []

  for (const fixture of fixtures) {
    const key = resolveS3Key(fixture.expenseFile)
    const mimeType = inferMimeType(key)

    if (!mimeType) {
      perRecord.push({
        id: fixture._id,
        status: 'skipped: unsupported file type (V1 is jpeg/png only)',
      })
      continue
    }

    try {
      const buffer = await fetchImageBuffer(key)
      const result = await extractInvoice({ buffer, mimeType })

      const scores = scoreRecord(result.extraction, {
        vendor: fixture.info ?? fixture.contactName ?? null,
        date: fixture.expenseDate?.toISOString().split('T')[0] ?? null,
        total: fixture.price ?? null,
        taxLow: fixture.taxLow ?? null,
        taxHigh: fixture.tax ?? null,
      })

      allScores.push(...scores)
      perRecord.push({ id: fixture._id, status: 'scored', scores })
    } catch (error) {
      perRecord.push({
        id: fixture._id,
        status: `failed: ${(error as Error).message}`,
      })
    }
  }

  const byField = new Map<string, { correct: number; total: number }>()
  for (const score of allScores) {
    const bucket = byField.get(score.field) ?? { correct: 0, total: 0 }
    bucket.total += 1
    if (score.correct) bucket.correct += 1
    byField.set(score.field, bucket)
  }

  console.log('\nPer-field accuracy:')
  for (const [field, bucket] of byField.entries()) {
    const pct = ((bucket.correct / bucket.total) * 100).toFixed(1)
    console.log(`  ${field}: ${pct}% (${bucket.correct}/${bucket.total})`)
  }

  const overallCorrect = allScores.filter((s) => s.correct).length
  const overallPct = allScores.length
    ? ((overallCorrect / allScores.length) * 100).toFixed(1)
    : 'n/a'
  console.log(
    `\nOverall: ${overallPct}% (${overallCorrect}/${allScores.length})`,
  )

  const resultsDir = path.join(__dirname, 'results')
  fs.mkdirSync(resultsDir, { recursive: true })
  const reportPath = path.join(resultsDir, `${Date.now()}.json`)
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      { perRecord, byField: Object.fromEntries(byField), overallPct },
      null,
      2,
    ),
  )
  console.log(`\nFull report: ${reportPath}`)

  process.exit(0)
}

run().catch((error) => {
  console.error('Eval run failed:', error)
  process.exit(1)
})
