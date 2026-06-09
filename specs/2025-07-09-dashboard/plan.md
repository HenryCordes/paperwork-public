# Paperwork - Dashboard & Reporting System

## Overview
This document outlines the implementation plan for adding financial dashboard and reporting capabilities to Paperwork, enabling users to visualize and export financial data across various time periods.

## Requirements

### Dashboard Requirements
- Visualize turnover and expenses using charts/graphs
- Support multiple filtering options:
  - Daily view
  - Monthly view
  - Quarterly view 
  - Period-based filters:
    - Last month
    - Last 3 months
    - Last 12 months
    - Any past year with data
- Interactive graphs with tooltips showing detailed information

### Export Requirements
- Generate CSV reports for:
  - Expenses (filtered by period)
  - Invoices (filtered by period)
  - Combined financial reports
- Allow customization of exported data columns
- Support the same time period filters as the dashboard

### Future Expansion
- Widget system to add more visualization components:
  - To-be-paid expenses
  - Pending invoices
  - Client-specific reports
  - Category-based spending analysis

## Database Design

### 1. Aggregated Stats Collection

```javascript
// models/DashboardStats.js
const dashboardStatsSchema = mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  // Could be "2025-07-09" for daily, "2025-07" for monthly, 
  // "2025-Q3" for quarterly, "2025" for yearly
  periodKey: {
    type: String,
    required: true
  },
  periodType: {
    type: String,
    enum: ['daily', 'monthly', 'quarterly', 'yearly'],
    required: true
  },
  periodStart: {
    type: Date,
    required: true
  },
  periodEnd: {
    type: Date, 
    required: true
  },
  stats: {
    // Revenue metrics
    totalRevenue: {
      type: Number,
      default: 0
    },
    paidRevenue: {
      type: Number, 
      default: 0
    },
    unpaidRevenue: {
      type: Number,
      default: 0
    },
    invoiceCount: {
      type: Number,
      default: 0
    },
    
    // Expense metrics
    totalExpenses: {
      type: Number,
      default: 0
    },
    paidExpenses: {
      type: Number,
      default: 0
    },
    unpaidExpenses: {
      type: Number,
      default: 0
    },
    expenseCount: {
      type: Number,
      default: 0
    },
    
    // Profit metrics
    netProfit: {
      type: Number,
      default: 0
    },
    
    // Categorical breakdowns (can be expanded)
    revenueByCategory: {
      type: Map,
      of: Number
    },
    expensesByCategory: {
      type: Map,
      of: Number
    },
    
    // Client metrics
    revenueByClient: {
      type: Map,
      of: Number
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient querying
dashboardStatsSchema.index({ tenant: 1, periodType: 1, periodKey: 1 }, { unique: true });
```

### 2. Report Template Model

```javascript
// models/ReportTemplate.js
const reportTemplateSchema = mongoose.Schema({
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  type: {
    type: String,
    enum: ['invoices', 'expenses', 'combined'],
    required: true
  },
  filters: {
    // Saved filter configuration
    periodType: {
      type: String,
      enum: ['daily', 'monthly', 'quarterly', 'yearly', 'custom'],
      default: 'monthly'
    },
    periodPreset: {
      type: String,
      enum: ['last_month', 'last_3_months', 'last_12_months', 'custom_year', 'all_time', null],
      default: null
    },
    customDateRange: {
      start: Date,
      end: Date
    },
    clients: [mongoose.Schema.Types.ObjectId], // References to Contact IDs
    categories: [String],
    paymentStatus: {
      type: String,
      enum: ['all', 'paid', 'unpaid'],
      default: 'all'
    }
  },
  columns: [String], // Array of column identifiers to include
  sortBy: {
    field: String,
    direction: {
      type: String,
      enum: ['asc', 'desc'],
      default: 'desc'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date, 
    default: Date.now
  }
});
```

## Implementation Strategy

### 1. Data Aggregation Approach

We'll implement a hybrid approach:

1. **Scheduled Aggregation:**
   - Daily job to calculate aggregated stats for all periods
   - Updates `DashboardStats` collection with pre-calculated metrics
   - Provides fast dashboard loading for common queries

2. **Real-time Calculation:**
   - Fallback for custom date ranges or missing aggregations
   - Uses MongoDB aggregation pipelines for on-demand calculations
   - Updates aggregation cache when new data is created

3. **Incremental Updates:**
   - When invoices/expenses are created/modified, update affected periods
   - Prevents need for full recalculation on every change

### 2. API Design

```
# Dashboard Data Endpoints
GET /api/dashboard/stats
  - Query params:
    - periodType: daily|monthly|quarterly|yearly
    - preset: last_month|last_3_months|last_12_months|custom_year
    - year: YYYY (for custom_year)
    - startDate: YYYY-MM-DD (for custom range)
    - endDate: YYYY-MM-DD (for custom range)

# Export Endpoints
POST /api/reports/export
  - Body:
    - type: invoices|expenses|combined
    - format: csv
    - filters: { period, dateRange, clients, categories, paymentStatus }
    - columns: [] (array of column identifiers)

# Report Template Endpoints
GET /api/reports/templates
POST /api/reports/templates
GET /api/reports/templates/:id
PUT /api/reports/templates/:id
DELETE /api/reports/templates/:id
```

### 3. Frontend Components

1. **Dashboard Page:**
   - Period selector component (daily/monthly/quarterly/yearly)
   - Preset filter selector (last month, last 3 months, etc.)
   - Year selector for historical data
   - Revenue/expense summary cards
   - Main chart component (configurable for different metrics)
   - Secondary charts (category breakdown, client breakdown)

2. **Report Generator:**
   - Report type selector
   - Period and filter controls
   - Column selection interface
   - Preview of report data
   - Export button with format options
   - Save as template option

3. **Widget System Architecture:**
   - Widget registry for dynamic loading
   - Widget configuration panel
   - Grid layout system for positioning
   - Shared data provider for consistent data access

## Receipt Export Implementation

### Approach Overview

- **Asynchronous Processing:** Use queue system to handle receipt exports without blocking user requests
- **Storage Strategy:** Use S3 with lifecycle policies for efficient temporary storage
- **User Experience:** Email notification with secure, time-limited download link

### Technical Implementation

1. **Queue System (Heroku Compatible)**
   - Use Redis + Bull/Bee-Queue for job management
   - Requires Heroku Redis add-on: `heroku addons:create heroku-redis:hobby-dev`
   - Configure dedicated worker dyno in Procfile: `worker: node worker.js`

2. **S3 Integration**
   - Stream zip creation directly to S3 (avoiding Heroku's ephemeral filesystem)
   - Configure lifecycle policy to auto-delete exports after 24 hours
   - Example bucket policy:
     ```json
     {
       "Rules": [{
         "ID": "ExpireExports",
         "Prefix": "exports/temporary/",
         "Status": "Enabled",
         "ExpirationInDays": 1
       }]
     }
     ```

3. **Processing Pipeline**
   ```javascript
   // Job queue processor
   exportQueue.process('expense-report-with-receipts', async (job) => {
     const { tenant, userId, filters } = job.data;
     
     // 1. Query filtered expenses
     const expenses = await Expense.find({ tenant, ...filters });
     
     // 2. Generate CSV data with receipt references
     const csvData = generateCSV(expenses, true);
     
     // 3. Create zip archive streaming to S3
     const s3UploadStream = createS3UploadStream(`exports/temporary/${jobId}.zip`);
     const archive = archiver('zip');
     archive.pipe(s3UploadStream);
     
     // 4. Add CSV to zip
     archive.append(csvData, { name: 'expenses.csv' });
     
     // 5. Add receipt images
     for (const expense of expenses) {
       if (expense.receiptImage) {
         // Get receipt from S3 and pipe to zip
         const receiptStream = getS3ObjectStream(expense.receiptImage);
         const filename = `receipts/${expense._id}.jpg`;
         archive.append(receiptStream, { name: filename });
       }
     }
     
     // 6. Finalize zip
     await archive.finalize();
     
     // 7. Generate signed URL (24hr expiry)
     const downloadUrl = s3.getSignedUrl('getObject', {
       Bucket: process.env.AWS_BUCKET,
       Key: `exports/temporary/${jobId}.zip`,
       Expires: 86400 // 24 hours
     });
     
     // 8. Send email with download link
     await sendExportEmail(userEmail, downloadUrl);
   });
   ```

## Cost Optimization Strategy

### Queue Worker Efficiency

1. **Event-Driven Worker Architecture**
   - Use Bull's event system to only consume resources when needed
   - Worker dynos automatically idle when no jobs are waiting
   - Only process as many jobs concurrently as you have capacity for

   ```javascript
   // worker.js - Optimized configuration
   const queue = new Bull('exports', redisConfig);
   
   // Only process one job at a time per worker to limit resource usage
   queue.process('expense-report-with-receipts', 1, async (job) => {
     // Process job...
   });
   
   // Idle detection for potential future optimizations
   let idleTime = 0;
   const idleInterval = setInterval(() => {
     idleTime += 30;
     if (idleTime > 60) {
       console.log('Worker idle for > 60 minutes');
       // Could implement auto-scaling down in the future
     }
   }, 30000);
   
   // Reset idle time when processing starts
   queue.on('active', () => {
     idleTime = 0;
   });
   ```

2. **Heroku Cost Optimization**
   - Scale workers to 0 during known inactive periods (can be automated)
   - Use Heroku's scheduler to automatically scale workers up/down
   - Consider Heroku's eco dynos for background processing jobs

3. **Redis Usage Optimization**
   - Use compressed job data to minimize Redis memory usage
   - Set appropriate job retention periods to avoid storage bloat
   - Choose the appropriate Redis plan based on job volume

4. **S3 Storage Optimization**
   - Use lifecycle policies with the shortest practical expiration (24-48 hours)
   - Compress images before adding to zip when appropriate
   - Use S3 storage class transitions for longer-term but infrequently accessed exports

### Queue Checking Costs

Checking for items on the queue is very efficient and effectively free with Redis:

- Redis operations like checking queue length are extremely fast (microseconds)
- The Redis connection is persistent, so there's no connection overhead
- Bull provides job counts without loading actual job data
- The Heroku Redis hobby-dev plan includes enough operations for typical queue usage

```javascript
// Very low-cost queue checking
async function getQueueStatus() {
  const counts = await queue.getJobCounts();
  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0
  };
}
```

## Rate Limiting Implementation

### Why Implement Rate Limiting?

1. **Resource Protection**
   - Prevent server overload from many simultaneous export requests
   - Maintain responsiveness of the application for all users
   - Protect against potential abuse or DoS attacks

2. **Cost Management**
   - Control S3 bandwidth and request costs
   - Manage Redis and worker dyno resource utilization
   - Prevent unexpected spikes in infrastructure costs

### Implementation Strategy

#### Version 1: Graceful Queueing Approach

For the initial implementation, we'll use a graceful queueing approach that provides the best user experience by never rejecting requests outright:

```javascript
// When rate limit is reached, queue for later instead of rejecting
const queuedExportController = async (req, res) => {
  const { userId, tenantId } = req;
  
  // Check if user is at their rate limit
  const userKey = `export-count:${userId}`;
  const userCount = await redisClient.get(userKey) || 0;
  
  if (userCount >= 5) { // User limit
    // Add to delayed queue instead of immediate processing
    const job = await exportQueue.add('expense-report-with-receipts', req.body, {
      delay: 3600000, // 1 hour delay
      priority: 10, // Lower priority
    });
    
    return res.status(202).json({
      message: 'Export request queued. You will be notified when it is ready (estimated > 1 hour).',
      jobId: job.id,
      delayed: true
    });
  }
  
  // Normal processing
  await redisClient.incr(userKey);
  if (userCount === 0) {
    await redisClient.expire(userKey, 60 * 60); // 1 hour window
  }
  
  // Add job to immediate queue
  const job = await exportQueue.add('expense-report-with-receipts', req.body);
  res.status(202).json({
    message: 'Export processing started',
    jobId: job.id
  });
};
```

#### Future Enhancement: Tenant-Level Rate Limiting

Designing for future tenant-based subscription tiers, we'll include structures to support organization-wide limits:

```javascript
// Database Schema Extension (for future implementation)
const subscriptionTierSchema = mongoose.Schema({
  name: { type: String, required: true },
  limits: {
    exportsPerDay: { type: Number, default: 20 },
    exportFileSize: { type: Number, default: 50 * 1024 * 1024 }, // 50MB
    concurrentExports: { type: Number, default: 2 },
    // Other tier-specific limits
  }
});

// Organization schema extension
organizationSchema.add({
  subscriptionTier: {
    type: String,
    enum: ['free', 'basic', 'premium', 'enterprise'],
    default: 'free'
  }
});
```

**Implementation Requirements for Future Tenant Limiting:**

1. **Tracking Mechanism:** Store usage metrics per tenant in Redis with TTL
2. **Tier Management:** Add subscription tier management to admin panel
3. **Limit Enforcement:** Add middleware to check tenant limits before processing
4. **UI Indicators:** Show organization admins their usage vs. limits
5. **Upgrade Path:** Provide clear upgrade options when approaching limits

## Detailed Database Aggregation Strategy

### Three-Tier Aggregation Approach

To optimize performance while maintaining flexibility, we'll implement a three-tier aggregation strategy:

#### 1. Pre-Calculated Daily Aggregations (Background Jobs)

```javascript
// Example MongoDB aggregation pipeline that runs on a schedule
const dailyAggregation = async (tenant, date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  // Aggregate invoices for the day
  const invoiceStats = await Invoice.aggregate([
    { 
      $match: { 
        tenant: mongoose.Types.ObjectId(tenant),
        date: { $gte: startOfDay, $lte: endOfDay } 
      } 
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalAmount" },
        paidRevenue: { 
          $sum: { 
            $cond: [{ $eq: ["$status", "paid"] }, "$totalAmount", 0] 
          } 
        },
        invoiceCount: { $sum: 1 }
      }
    }
  ]);
  
  // Aggregate expenses for the day
  const expenseStats = await Expense.aggregate([
    { 
      $match: { 
        tenant: mongoose.Types.ObjectId(tenant),
        date: { $gte: startOfDay, $lte: endOfDay } 
      } 
    },
    {
      $group: {
        _id: null,
        totalExpenses: { $sum: "$amount" },
        paidExpenses: { 
          $sum: { 
            $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$amount", 0] 
          } 
        },
        expenseCount: { $sum: 1 },
        expensesByCategory: { 
          $push: { 
            category: "$category", 
            amount: "$amount" 
          } 
        }
      }
    }
  ]);
  
  // Store in DashboardStats collection
  await DashboardStats.findOneAndUpdate(
    { 
      tenant,
      periodKey: date.toISOString().split('T')[0], // YYYY-MM-DD
      periodType: 'daily' 
    },
    {
      $set: {
        tenant,
        periodKey: date.toISOString().split('T')[0],
        periodType: 'daily',
        periodStart: startOfDay,
        periodEnd: endOfDay,
        stats: {
          totalRevenue: invoiceStats[0]?.totalRevenue || 0,
          paidRevenue: invoiceStats[0]?.paidRevenue || 0,
          invoiceCount: invoiceStats[0]?.invoiceCount || 0,
          totalExpenses: expenseStats[0]?.totalExpenses || 0,
          paidExpenses: expenseStats[0]?.paidExpenses || 0,
          expenseCount: expenseStats[0]?.expenseCount || 0,
          netProfit: (invoiceStats[0]?.totalRevenue || 0) - (expenseStats[0]?.totalExpenses || 0),
          // Process category data
          expensesByCategory: processCategories(expenseStats[0]?.expensesByCategory || [])
        },
        lastUpdated: new Date()
      }
    },
    { upsert: true }
  );
};
```

#### 2. Cascading Aggregation for Monthly/Quarterly/Yearly

```javascript
const monthlyAggregation = async (tenant, year, month) => {
  const startDate = new Date(year, month-1, 1);
  const endDate = new Date(year, month, 0); // Last day of month
  
  // Get all daily stats for the month
  const dailyStats = await DashboardStats.find({
    tenant,
    periodType: 'daily',
    periodStart: { $gte: startDate },
    periodEnd: { $lte: endDate }
  });
  
  // Aggregate from daily stats instead of raw data
  const monthStats = dailyStats.reduce((acc, day) => {
    acc.totalRevenue += day.stats.totalRevenue;
    acc.paidRevenue += day.stats.paidRevenue;
    acc.invoiceCount += day.stats.invoiceCount;
    acc.totalExpenses += day.stats.totalExpenses;
    acc.paidExpenses += day.stats.paidExpenses;
    acc.expenseCount += day.stats.expenseCount;
    
    // Merge category data
    if (day.stats.expensesByCategory) {
      Object.entries(day.stats.expensesByCategory).forEach(([category, amount]) => {
        acc.expensesByCategory[category] = (acc.expensesByCategory[category] || 0) + amount;
      });
    }
    
    return acc;
  }, {
    totalRevenue: 0,
    paidRevenue: 0,
    invoiceCount: 0,
    totalExpenses: 0,
    paidExpenses: 0,
    expenseCount: 0,
    expensesByCategory: {}
  });
  
  // Store monthly aggregation
  await DashboardStats.findOneAndUpdate(
    { 
      tenant,
      periodKey: `${year}-${month.toString().padStart(2, '0')}`, // YYYY-MM
      periodType: 'monthly' 
    },
    {
      tenant,
      periodKey: `${year}-${month.toString().padStart(2, '0')}`,
      periodType: 'monthly',
      periodStart: startDate,
      periodEnd: endDate,
      stats: monthStats,
      lastUpdated: new Date()
    },
    { upsert: true }
  );
};
```

#### 3. On-Demand Dynamic Aggregation

```javascript
const dynamicAggregation = async (tenant, startDate, endDate, groupBy = 'day') => {
  // Format for MongoDB date grouping
  let dateFormat;
  switch (groupBy) {
    case 'day':
      dateFormat = { year: { $year: "$date" }, month: { $month: "$date" }, day: { $dayOfMonth: "$date" } };
      break;
    case 'month':
      dateFormat = { year: { $year: "$date" }, month: { $month: "$date" } };
      break;
    case 'quarter':
      dateFormat = { year: { $year: "$date" }, quarter: { $ceil: { $divide: [{ $month: "$date" }, 3] } } };
      break;
    case 'year':
      dateFormat = { year: { $year: "$date" } };
      break;
  }

  // Revenue aggregation
  const revenuePipeline = [
    { 
      $match: { 
        tenant: mongoose.Types.ObjectId(tenant),
        date: { $gte: startDate, $lte: endDate } 
      } 
    },
    {
      $group: {
        _id: dateFormat,
        totalRevenue: { $sum: "$totalAmount" },
        paidRevenue: { 
          $sum: { 
            $cond: [{ $eq: ["$status", "paid"] }, "$totalAmount", 0] 
          } 
        },
        invoiceCount: { $sum: 1 }
      }
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
    }
  ];

  // Run aggregations in parallel
  const [revenueResults, expenseResults] = await Promise.all([
    Invoice.aggregate(revenuePipeline),
    Expense.aggregate(/* Similar expense pipeline */)
  ]);
  
  // Merge and return results
  return mergeAggregationResults(revenueResults, expenseResults, groupBy);
};
```

### Orchestration Strategy

#### 1. Scheduled Background Jobs

```javascript
// Schedule daily aggregation after midnight
const scheduleDailyAggregation = () => {
  const rule = new schedule.RecurrenceRule();
  rule.hour = 1; // 1 AM
  rule.minute = 0;
  
  schedule.scheduleJob(rule, async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const tenants = await Organization.find({}, '_id');
    
    for (const tenant of tenants) {
      try {
        await dailyAggregation(tenant._id, yesterday);
        console.log(`Daily aggregation completed for tenant ${tenant._id}`);
      } catch (error) {
        console.error(`Error in daily aggregation for tenant ${tenant._id}:`, error);
      }
    }
  });
};

// Schedule monthly aggregation on the 1st of each month
const scheduleMonthlyAggregation = () => {
  const rule = new schedule.RecurrenceRule();
  rule.date = 1; // 1st day of month
  rule.hour = 2; // 2 AM
  rule.minute = 0;
  
  schedule.scheduleJob(rule, async () => {
    const lastMonth = new Date();
    lastMonth.setDate(0); // Go to last day of previous month
    
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth() + 1; // 0-indexed to 1-indexed
    
    const tenants = await Organization.find({}, '_id');
    
    for (const tenant of tenants) {
      try {
        await monthlyAggregation(tenant._id, year, month);
        console.log(`Monthly aggregation completed for tenant ${tenant._id}`);
      } catch (error) {
        console.error(`Error in monthly aggregation for tenant ${tenant._id}:`, error);
      }
    }
  });
};
```

#### 2. Real-time Update Triggers

```javascript
// Hook into invoice/expense creation and updates
invoiceSchema.post('save', async function() {
  const invoice = this;
  const date = new Date(invoice.date);
  date.setHours(0, 0, 0, 0);
  
  // Update daily stats for this invoice's date
  try {
    await refreshDailyAggregation(invoice.tenant, date);
  } catch (err) {
    console.error('Failed to update daily aggregation after invoice change:', err);
  }
});

expenseSchema.post('save', async function() {
  const expense = this;
  const date = new Date(expense.date);
  date.setHours(0, 0, 0, 0);
  
  // Update daily stats for this expense's date
  try {
    await refreshDailyAggregation(expense.tenant, date);
  } catch (err) {
    console.error('Failed to update daily aggregation after expense change:', err);
  }
});
```

#### 3. Smart API Fallback Strategy

```javascript
// Dashboard controller with intelligent data source selection
const getDashboardData = async (req, res) => {
  const { periodType, startDate, endDate, preset } = req.query;
  const tenant = req.tenant._id;
  
  try {
    // Try to get from pre-calculated stats first
    if (['daily', 'monthly', 'quarterly', 'yearly'].includes(periodType) && !startDate && !endDate) {
      const stats = await getPreCalculatedStats(tenant, periodType, preset);
      
      if (stats && stats.length > 0) {
        return res.json({
          success: true,
          data: stats,
          source: 'pre-calculated'
        });
      }
    }
    
    // Fall back to dynamic aggregation when needed
    const parsedStartDate = startDate ? new Date(startDate) : getDefaultStartDate(periodType, preset);
    const parsedEndDate = endDate ? new Date(endDate) : new Date();
    
    const dynamicStats = await dynamicAggregation(
      tenant,
      parsedStartDate,
      parsedEndDate,
      periodType === 'daily' ? 'day' : 
      periodType === 'monthly' ? 'month' : 
      periodType === 'quarterly' ? 'quarter' : 'year'
    );
    
    return res.json({
      success: true,
      data: dynamicStats,
      source: 'dynamic'
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard data'
    });
  }
};
```

### Performance Optimizations

1. **Efficient Indexing**
   - Compound index on `tenant` + `date` fields
   - Index on `periodKey` + `periodType` for fast lookups
   - Covering indexes where appropriate to avoid document lookups

2. **Incremental Updates**
   - Only recompute the specific periods affected by data changes
   - Use MongoDB's atomic operators like `$inc` for efficient updates

3. **Caching Strategy**
   - Cache frequently accessed dashboard data in Redis
   - Set appropriate TTL based on data volatility
   - Invalidate cache selectively when related documents change

4. **Progressive Loading**
   - Return summary data first, then load details on demand
   - Use pagination for large datasets
   - Implement data sampling for very large time ranges

## Implementation Phases

### Phase 1: Core Database & API (Weeks 1-2)
- Implement DashboardStats model
- Create aggregation logic and scheduled jobs
- Build basic dashboard data endpoints
- Set up S3 lifecycle policies for temporary export storage
- Implement cost optimization for job processing

### Phase 2: Dashboard Frontend (Weeks 3-4)
- Create dashboard page layout
- Implement chart components
- Build period selection and filtering

### Phase 3: Report Generation & Export (Weeks 5-6)
- Implement ReportTemplate model
- Create export API endpoints
- Build CSV generation logic
- Develop report configuration UI

### Phase 4: Widget System & Polish (Weeks 7-8)
- Design extensible widget architecture
- Implement first set of additional widgets
- Add dashboard customization options
- Performance optimization and testing

## Technical Considerations

### Performance
- Use appropriate indexes on financial date fields
- Implement caching for frequent dashboard queries
- Use streaming for large data exports
- Consider pagination for widget data

### Security
- Enforce tenant isolation for all financial data
- Validate date ranges to prevent excessive queries
- Apply rate limiting on export endpoints

### Scalability
- Design widget system for plugin-style extensions
- Support query optimization for large datasets
- Consider future data growth in aggregation design

## Next Steps

1. Review and finalize database schema design
2. Create MVP aggregation pipeline
3. Implement first dashboard API endpoint
4. Build basic chart component prototype
