const mongoose = require('mongoose')
const dotenv = require('dotenv')
const { faker } = require('@faker-js/faker')
const { program } = require('commander')

// Parse command line options
program
  .option('-k, --keep-data', 'Keep existing data instead of deleting it')
  .option('-o, --organizations-only', 'Only generate organizations and users')
  .option(
    '-d, --dashboard-only',
    'Only generate dashboard aggregations (assumes data exists)',
  )
  .option(
    '--delete-dashboard-stats',
    'Delete all dashboard statistics without affecting other data',
  )
  .parse(process.argv)

const options = program.opts()

// Load environment variables
dotenv.config({ path: './config/config.env' })

// Models
const Organization = require('../models/Organization')
const User = require('../models/User')
const Invoice = require('../models/Invoice')
const Expense = require('../models/Expense')
const Contact = require('../models/Contact')
const Subscription = require('../models/Subscription')
const Settings = require('../models/Settings')
const DashboardStats = require('../models/DashboardStats')

// Dashboard aggregation service
const {
  refreshDailyAggregation,
  setupScheduledJobs,
} = require('../services/dashboardAggregation')

// Connect to Database
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

// Set faker locale
faker.locale = 'nl'

/**
 * Generate test data for dashboard visualization and export functionality
 * Creates organizations, users, contacts, invoices, and expenses for testing
 */
async function generateTestData() {
  try {
    console.log('Starting test data generation...')
    console.log('Options:', JSON.stringify(options, null, 2))

    // Handle the option to delete all dashboard stats
    if (options.deleteDashboardStats) {
      console.log('Deleting all dashboard statistics...')
      await DashboardStats.deleteMany({})
      console.log('All dashboard statistics have been deleted.')
      process.exit(0)
    }

    let organizations = []
    let users = []
    let contacts = []

    // Create organizations and users regardless of mode
    if (!options.dashboardOnly) {
      // Create organizations (tenants)
      organizations = await createOrganizations(options.keepData)
      console.log(`Created ${organizations.length} organizations`)

      // Create users for each organization
      users = await createUsers(organizations, options.keepData)
      console.log(`Created ${users.length} users`)

      // Create subscriptions for users and organizations
      const subscriptions = await createSubscriptions(
        organizations,
        users,
        options.keepData,
      )
      console.log(`Created ${subscriptions.length} subscriptions`)

      // Create settings for each organization
      const settings = await createSettings(organizations, options.keepData)
      console.log(`Created ${settings.length} settings documents`)
    } else {
      // In dashboard-only mode, fetch existing organizations
      organizations = await Organization.find({}).lean()
      console.log(
        `Found ${organizations.length} existing organizations for aggregation`,
      )
    }

    // Stop here if only creating organizational structure
    if (options.organizationsOnly) {
      console.log(
        'Organizations-only mode. Skipping transaction data generation.',
      )
    } else if (!options.dashboardOnly) {
      // Create contacts for each organization
      contacts = await createContacts(organizations, options.keepData)
      console.log(`Created ${contacts.length} contacts`)

      // Generate invoices spanning the past 2 years
      const invoices = await generateInvoices(
        organizations,
        users,
        contacts,
        options.keepData,
      )
      console.log(`Created ${invoices.length} invoices`)

      // Generate expenses spanning the past 2 years
      const expenses = await generateExpenses(
        organizations,
        users,
        options.keepData,
      )
      console.log(`Created ${expenses.length} expenses`)
    }

    // Generate dashboard aggregations for the test data
    await generateAggregations(organizations)
    console.log('Test data generation complete!')
    console.log('You can now use the dashboard with these organizations:')
    organizations.forEach((org) => {
      console.log(`- ${org.name} (ID: ${org._id})`)
    })

    process.exit(0)
  } catch (error) {
    console.error('Error generating test data:', error)
    process.exit(1)
  }
}

/**
 * Create test organizations
 * @param {boolean} keepExistingData - Whether to keep existing data
 * @returns {Promise<Array>} Created organizations
 */
async function createOrganizations(keepExistingData = false) {
  // Clear existing data unless keepExistingData is true
  if (!keepExistingData) {
    console.log('Deleting existing organizations...')
    await Organization.deleteMany({})
  } else {
    console.log('Keeping existing organizations...')
  }

  const organizations = [
    {
      name: 'Acme Web Development',
      country: 'Netherlands',
      subscriptionTier: 'premium',
    },
    {
      name: 'Globex Design Studio',
      country: 'Netherlands',
      subscriptionTier: 'basic',
    },
  ]

  return Organization.create(organizations)
}

/**
 * Create test users for organizations
 * @param {Array} organizations - Created organizations
 * @param {boolean} keepExistingData - Whether to keep existing data
 * @returns {Promise<Array>} Created users
 */
async function createUsers(organizations, keepExistingData = false) {
  // Clear existing data unless keepExistingData is true
  if (!keepExistingData) {
    console.log('Deleting existing users...')
    await User.deleteMany({})
  } else {
    console.log('Keeping existing users...')
  }

  const users = []

  for (const org of organizations) {
    // Create an admin user for each organization
    const user = {
      name: faker.person.fullName(), // Using the correct API for v9+
      email: faker.internet.email().toLowerCase(),
      password: 'password123',
      tenantId: org._id,
      organization: org._id, // Add organization field for proper subscription linking
      role: 'admin',
    }

    console.log(
      `Creating user ${user.name} for organization ${org.name} (${org._id})`,
    )
    users.push(user)
  }

  return User.create(users)
}

/**
 * Create test subscriptions for organizations and users
 * @param {Array} organizations - Created organizations
 * @param {Array} users - Created users
 * @param {boolean} keepExistingData - Whether to keep existing data
 * @returns {Promise<Array>} Created subscriptions
 */
async function createSubscriptions(
  organizations,
  users,
  keepExistingData = false,
) {
  // Clear existing data unless keepExistingData is true
  if (!keepExistingData) {
    console.log('Deleting existing subscriptions...')
    await Subscription.deleteMany({})
  } else {
    console.log('Keeping existing subscriptions...')
  }

  const subscriptions = []
  const now = new Date()

  // Create a subscription for each user
  for (let i = 0; i < users.length; i++) {
    const user = users[i]

    // Find matching organization using the user's organization field (ObjectId reference)
    let org = null

    if (user.organization) {
      // First try to match by the user's organization field (proper way)
      org = organizations.find(
        (o) => o._id.toString() === user.organization.toString(),
      )
      console.log(
        `Found organization for user ${user._id} using organization field: ${
          org ? org._id : 'none found'
        }`,
      )
    } else if (user.tenantId) {
      // Fallback to tenantId if organization field isn't set
      org = organizations.find(
        (o) => o._id.toString() === user.tenantId.toString(),
      )
      console.log(
        `Found organization for user ${user._id} using tenantId field: ${
          org ? org._id : 'none found'
        }`,
      )
    }

    // If no matching organization found
    if (!org) {
      if (organizations.length > 0) {
        // IMPORTANT: Do not use the first organization as a default
        // This prevents all subscriptions from going to the same organization
        console.log(
          `No matching organization found for user ${user._id} - SKIPPING subscription creation`,
        )
      } else {
        console.log(
          `Skipping subscription creation for user ${user._id}, no organizations available`,
        )
      }
      continue // Skip this user entirely, don't create subscription for wrong organization
    }

    // Generate next payment date 6 months in the future
    const nextPaymentDate = new Date(now)
    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 6)

    // Generate payment date in the past
    const subscriptionPayDate = new Date(now)
    subscriptionPayDate.setMonth(subscriptionPayDate.getMonth() - 1)

    subscriptions.push({
      owner: user._id,
      tenantId: org._id,
      subscriptionDate: new Date(now),
      subscriptionPayDate,
      plan:
        org.subscriptionTier === 'premium' ? 'Essentials Year' : 'Essentials',
      paymentState: 'paid',
      userId: user._id.toString(),
      userIds: [user._id.toString()],
      customerId: `cst_${faker.string.uuid().substring(0, 10)}`,
      orderId: faker.number
        .int({ min: 1000000000, max: 9999999999 })
        .toString(),
      paymentId: `tr_${faker.string.uuid().substring(0, 10)}`,
      paymentPrice: org.subscriptionTier === 'premium' ? '99.99' : '9.99',
      paymentCurrency: 'EUR',
      subscriptionStatus: 'active', // Important for authentication middleware
      nextPaymentDate, // Important for subscription verification
    })
  }

  return Subscription.create(subscriptions)
}

/**
 * Create test contacts for organizations
 * @param {Array} organizations - Created organizations
 * @param {boolean} keepExistingData - Whether to keep existing data
 * @returns {Promise<Array>} Created contacts
 */
async function createContacts(organizations, keepExistingData = false) {
  // Clear existing data unless keepExistingData is true
  if (!keepExistingData) {
    console.log('Deleting existing contacts...')
    await Contact.deleteMany({})
  } else {
    console.log('Keeping existing contacts...')
  }

  const contacts = []

  for (const org of organizations) {
    // Create 5 contacts per organization
    for (let i = 0; i < 5; i++) {
      const contactPerson = {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
      }

      contacts.push({
        tenantId: org._id,
        owner: org.owner || org._id, // Use org.owner if available, otherwise use org ID
        companyName: faker.company.name(),
        emailAddress: faker.internet.email().toLowerCase(),
        phoneNumber: faker.phone.number(),
        street: faker.location.street(),
        city: faker.location.city(),
        postalCode: faker.location.zipCode(),
        country: 'Nederland', // Using value from allowedValues
        firstName: contactPerson.firstName,
        lastName: contactPerson.lastName,
        typeOfContact: Math.random() > 0.5 ? 'Klant' : 'Leverancier', // Random selection from allowed values
        typeName: Math.random() > 0.3 ? 'Bedrijf' : 'Particulier', // Random selection from allowed values
      })
    }
  }

  return Contact.create(contacts)
}

/**
 * Create settings for each organization
 * @param {Array} organizations - Created organizations
 * @param {boolean} keepExistingData - Whether to keep existing data
 * @returns {Promise<Array>} Created settings
 */
async function createSettings(organizations, keepExistingData = false) {
  // Clear existing settings unless keepExistingData is true
  if (!keepExistingData) {
    console.log('Deleting existing settings...')
    await Settings.deleteMany({})
  } else {
    console.log('Keeping existing settings...')
  }

  const settingsArray = []

  for (const org of organizations) {
    settingsArray.push({
      tenantId: org._id,
      companyName: org.name,
      street: faker.location.street(),
      houseNumber: faker.number.int({ min: 1, max: 150 }).toString(),
      postalCode: faker.location.zipCode(),
      city: faker.location.city(),
      country: 'Nederland',
      phoneNumber: faker.phone.number(),
      companyEmail: faker.internet.email().toLowerCase(),
      taxNumber: `NL${faker.number.int({
        min: 100000000,
        max: 999999999,
      })}B${faker.number.int({ min: 10, max: 99 })}`,
      chamberOfCommerceNumber: faker.number
        .int({ min: 10000000, max: 99999999 })
        .toString(),
      bankName: [
        'ING Bank',
        'ABN AMRO',
        'Rabobank',
        'SNS Bank',
        'Triodos Bank',
      ][Math.floor(Math.random() * 5)],
      bankIBAN: `NL${faker.number.int({ min: 10, max: 99 })}${
        ['INGB', 'ABNA', 'RABO', 'SNSB', 'TRIO'][Math.floor(Math.random() * 5)]
      }0${faker.number.int({ min: 100000000, max: 999999999 })}`,
    })
  }

  return Settings.create(settingsArray)
}

/**
 * Generate test invoices across a 2-year period
 * @param {Array} organizations - Created organizations
 * @param {Array} users - Created users
 * @param {Array} contacts - Created contacts
 * @param {boolean} keepExistingData - Whether to keep existing data
 * @returns {Promise<Array>} Created invoices
 */
async function generateInvoices(
  organizations,
  users,
  contacts,
  keepExistingData = false,
) {
  // Clear existing data unless keepExistingData is true
  if (!keepExistingData) {
    console.log('Deleting existing invoices...')
    await Invoice.deleteMany({})
  } else {
    console.log('Keeping existing invoices...')
  }

  console.log(
    `Starting invoice generation for ${organizations.length} organizations, ${users.length} users, ${contacts.length} contacts...`,
  )

  const invoices = []
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 1) // 1 year ago

  for (const org of organizations) {
    console.log(`Processing organization: ${org.name} (${org._id})`)

    // Find all users that belong to this organization using the organization field
    const orgUsers = users.filter(
      (user) =>
        user.organization &&
        user.organization.toString() === org._id.toString(),
    )

    // Make sure we have at least one user for this organization
    if (orgUsers.length === 0) {
      console.log(
        `No users found for organization ${org.name} (${org._id}) - skipping`,
      )
      continue
    }
    console.log(`Found ${orgUsers.length} users for organization ${org.name}`)

    // Get organization's contacts
    const orgContacts = contacts.filter(
      (contact) =>
        contact.tenantId && contact.tenantId.toString() === org._id.toString(),
    )
    console.log(
      `Found ${orgContacts.length} contacts for organization ${org.name}`,
    )

    if (orgUsers.length === 0 || orgContacts.length === 0) {
      console.log(`Skipping ${org.name} - missing users or contacts`)
      continue
    }

    // Generate invoices for past 12 months only
    for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
      const currentDate = new Date(startDate)
      currentDate.setMonth(startDate.getMonth() + monthOffset)

      // Generate 2-8 invoices per month with random day
      const invoicesThisMonth = faker.number.int({ min: 2, max: 8 })

      for (let i = 0; i < invoicesThisMonth; i++) {
        const invoiceDate = new Date(currentDate)
        invoiceDate.setDate(faker.number.int({ min: 1, max: 28 }))

        // Randomly select contact
        const contact =
          orgContacts[Math.floor(Math.random() * orgContacts.length)]

        // Generate invoice lines
        const invoiceLines = []
        const lineCount = faker.number.int({ min: 1, max: 5 })
        let totalPrice = 0
        let totalTax = 0
        let totalTaxLow = 0

        for (let j = 0; j < lineCount; j++) {
          const priceWOTaxes = parseFloat(
            faker.commerce.price({ min: 50, max: 500 }),
          )
          const taxRate = [21, 9, 6, 0][Math.floor(Math.random() * 4)] // Common Dutch tax rates
          const taxAmount = priceWOTaxes * (taxRate / 100)
          const priceIncludingTax = priceWOTaxes + taxAmount
          const numberOfItems = faker.number.int({ min: 1, max: 10 })
          const totalLinePrice = priceIncludingTax * numberOfItems

          totalPrice += totalLinePrice

          if (taxRate === 21) {
            totalTax += taxAmount * numberOfItems
          } else if (taxRate === 9 || taxRate === 6) {
            totalTaxLow += taxAmount * numberOfItems
          }

          invoiceLines.push({
            description: faker.commerce.productName(),
            priceWOTaxes: priceWOTaxes.toFixed(2),
            priceIncludingTax: priceIncludingTax.toFixed(2),
            taxRate,
            numberOfItems,
            totalLinePrice: totalLinePrice.toFixed(2),
          })
        }

        // Random payment status (70% paid, 30% open)
        const isPaid = Math.random() < 0.7

        // Create the invoice
        invoices.push({
          tenantId: org._id,
          owner: orgUsers[0]._id,
          invoiceDate,
          payDate: new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days later
          info: faker.lorem.sentence(),
          tax: totalTax,
          taxLow: totalTaxLow,
          price: totalPrice.toFixed(2),
          state: isPaid ? 'Betaald' : 'Open',
          contactId: contact._id.toString(),
          contactName:
            contact.firstName && contact.lastName
              ? `${contact.firstName} ${contact.lastName}`
              : contact.companyName,
          invoiceLines,
        })
      }
    }
  }

  return Invoice.create(invoices)
}

/**
 * Generate test expenses across a 2-year period
 * @param {Array} organizations - Created organizations
 * @param {Array} users - Created users
 * @param {boolean} keepExistingData - Whether to keep existing data
 * @returns {Promise<Array>} Created expenses
 */
async function generateExpenses(
  organizations,
  users,
  keepExistingData = false,
) {
  // Clear existing data unless keepExistingData is true
  if (!keepExistingData) {
    console.log('Deleting existing expenses...')
    await Expense.deleteMany({})
  } else {
    console.log('Keeping existing expenses...')
  }

  const expenses = []
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 1) // 1 year ago

  // Common expense categories
  const categories = [
    'Rent',
    'Utilities',
    'Software',
    'Hardware',
    'Office Supplies',
    'Marketing',
    'Travel',
    'Meals',
    'Salaries',
    'Insurance',
    'Training',
    'Professional Services',
  ]

  for (const org of organizations) {
    // Find all users that belong to this organization using the organization field
    const orgUsers = users.filter(
      (user) =>
        user.organization &&
        user.organization.toString() === org._id.toString(),
    )

    // Make sure we have at least one user for this organization
    if (orgUsers.length === 0) {
      console.log(
        `No users found for organization ${org.name} (${org._id}) in expenses - skipping`,
      )
      continue
    }
    console.log(
      `Found ${orgUsers.length} users for organization ${org.name} in expenses`,
    )

    // Generate expenses for past 12 months
    for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
      const currentDate = new Date(startDate)
      currentDate.setMonth(startDate.getMonth() + monthOffset)

      // Generate 5-15 expenses per month with random day
      const expensesThisMonth = faker.number.int({ min: 5, max: 15 })

      for (let i = 0; i < expensesThisMonth; i++) {
        const expenseDate = new Date(currentDate)
        expenseDate.setDate(faker.number.int({ min: 1, max: 28 }))

        // Random category
        const category =
          categories[Math.floor(Math.random() * categories.length)]

        // Random amount between 10 and 2000
        const price = parseFloat(faker.commerce.price({ min: 10, max: 2000 }))

        // Calculate tax amounts
        const taxRate = Math.random() < 0.8 ? 21 : 9 // 80% high tax, 20% low tax
        const priceWOTaxes = price / (1 + taxRate / 100)
        const taxAmount = price - priceWOTaxes

        // Create the expense
        expenses.push({
          tenantId: org._id,
          owner: orgUsers[0]._id,
          expenseDate,
          info: `${category}: ${faker.commerce.productName()}`,
          tax: taxRate === 21 ? taxAmount.toFixed(2) : 0,
          taxLow: taxRate === 9 ? taxAmount.toFixed(2) : 0,
          priceWOTaxes: priceWOTaxes.toFixed(2),
          price: price.toFixed(2),
          category,
        })
      }
    }
  }

  return Expense.create(expenses)
}

/**
 * Generate dashboard aggregations for the test data
 * @param {Array} organizations - Created organizations
 */
async function generateAggregations(organizations) {
  console.log('Generating dashboard aggregations...')

  for (const org of organizations) {
    console.log(`Generating aggregations for ${org.name}...`)

    // Get all dates with data in the past 2 years
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 1) // 1 year ago

    // Get all invoice dates
    const invoiceDates = await Invoice.find(
      { tenantId: org._id, invoiceDate: { $gte: startDate } },
      'invoiceDate',
    ).lean()

    // Get all expense dates
    const expenseDates = await Expense.find(
      { tenantId: org._id, expenseDate: { $gte: startDate } },
      'expenseDate',
    ).lean()

    // Combine and de-duplicate dates
    const allDates = [
      ...invoiceDates.map((i) => new Date(i.invoiceDate)),
      ...expenseDates.map((e) => new Date(e.expenseDate)),
    ]

    console.log(
      `Found ${invoiceDates.length} invoice dates and ${expenseDates.length} expense dates.`,
    )

    // Get unique days (truncate to start of day)
    const uniqueDays = new Map()
    allDates.forEach((date) => {
      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayKey = dayStart.toISOString().split('T')[0]
      uniqueDays.set(dayKey, dayStart)
    })

    // Generate aggregations for each unique day
    let count = 0
    for (const [_, date] of uniqueDays) {
      // Convert ObjectId to string for consistency with our tenantId approach
      const tenantId = org._id.toString()
      await refreshDailyAggregation(tenantId, date)
      count++

      // Log progress every 20 aggregations
      if (count % 20 === 0) {
        console.log(
          `Processed ${count}/${uniqueDays.size} days for ${org.name}`,
        )
      }
    }

    console.log(`Completed ${count} aggregations for ${org.name}`)
  }
}

// Run the script
console.log(`MongoDB URI: ${process.env.MONGO_URI.substring(0, 20)}...`)
console.log('Run with --help for available options')
console.log('Examples:')
console.log(
  '  node scripts/generate-test-data.js               # Generate all data, delete existing',
)
console.log(
  '  node scripts/generate-test-data.js --keep-data  # Generate without deleting existing',
)
console.log(
  '  node scripts/generate-test-data.js --organizations-only  # Only create orgs/users',
)
console.log(
  '  node scripts/generate-test-data.js --dashboard-only      # Only regenerate dashboards',
)

generateTestData()
