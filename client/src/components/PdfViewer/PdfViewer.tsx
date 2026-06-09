import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf/dist/esm/entry.webpack'

interface PdfViewerProps {
  pdf: string
}

const PdfViewer = ({ pdf }: PdfViewerProps) => {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPageNumber(1)
  }

  const changePage = (offset: number) => {
    setPageNumber((prevPageNumber) => prevPageNumber + offset)
  }

  const previousPage = (e: React.MouseEvent) => {
    e.preventDefault()
    changePage(-1)
  }

  const nextPage = (e: React.MouseEvent) => {
    e.preventDefault()
    changePage(1)
  }

  return (
    <>
      <div>
        <Document
          file={pdf}
          options={{
            workerSrc: `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`,
          }}
          onLoadSuccess={onDocumentLoadSuccess}
        >
          <Page pageNumber={pageNumber} />
        </Document>
      </div>
      <br />
      <div className="centered pagination-container">
        <button
          className="icon-button left"
          disabled={pageNumber <= 1}
          onClick={previousPage}
        ></button>
        <span className="pagination-text">
          Pagina {pageNumber || (numPages ? 1 : '--')} / {numPages || '--'}{' '}
        </span>
        <button
          className="icon-button right"
          disabled={numPages !== null && pageNumber >= numPages}
          onClick={nextPage}
        ></button>
      </div>
    </>
  )
}
export default PdfViewer
