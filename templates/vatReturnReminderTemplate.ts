/**
 * VAT Return Reminder Email Template
 * Dutch language template for VAT return deadline reminders
 */

interface VatReminderData {
  userName?: string
  companyName?: string
  periodLabel?: string
  deadline?: string
  daysUntilDeadline?: number
  isSecondReminder?: boolean
  exportUrl?: string
  loginUrl?: string
}

const vatReturnReminderTemplate = (data: VatReminderData): string => {
  const {
    userName,
    companyName,
    periodLabel,
    deadline,
    daysUntilDeadline,
    isSecondReminder,
    exportUrl,
  } = data

  const urgencyClass = (daysUntilDeadline as number) <= 3 ? 'urgent' : 'normal'
  const reminderType = isSecondReminder ? 'Laatste herinnering' : 'Herinnering'

  return `
    <!DOCTYPE html>
    <html lang="nl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BTW Aangifte ${reminderType} - Paperwork</title>
        <style>
            body {
                font-family: helvetica, arial, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 0 auto;
                padding: 20px;
                background-color: #f2f4f5;
            }
            .wrapper {
                margin: 0 auto;
                padding: 60px 20px;
                background-color: #f2f4f5;
            }
            .header {
                text-align: center;
                padding-bottom: 20px;
            }
            .container {
                background-color: #ffffff;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                box-sizing: border-box;
                margin: 0 auto;
                max-width: 600px;
            }
            .logo {
                text-align: center;
                font-size: 1.8rem;
                color: #000000;
                width: 100%;
            }
            .logo img {
                height: 60px;
                width:60px
            }
            .greeting {
                margin-bottom: 20px;
                color: #333;
            }
            .deadline-alert {
                background-color: ${
                  urgencyClass === 'urgent' ? '#f8d7da' : '#f8f9fa'
                };
                border: 2px dashed ${
                  urgencyClass === 'urgent' ? '#dc3545' : 'rgb(50, 50, 50)'
                };
                padding: 20px;
                text-align: center;
                margin: 20px 0;
                border-radius: 8px;
            }
            .deadline-icon {
                font-size: 48px;
                margin-bottom: 10px;
            }
            .deadline-title {
                font-size: 20px;
                font-weight: bold;
                color: ${
                  urgencyClass === 'urgent' ? '#721c24' : 'rgb(50, 50, 50)'
                };
                margin-bottom: 10px;
            }
            .deadline-date {
                font-size: 32px;
                font-weight: bold;
                color: ${
                  urgencyClass === 'urgent' ? '#dc3545' : 'rgb(50, 50, 50)'
                };
                letter-spacing: 2px;
                font-family: 'Courier New', monospace;
                margin: 10px 0;
            }
            .days-remaining {
                font-size: 16px;
                color: ${
                  urgencyClass === 'urgent' ? '#721c24' : 'rgb(50, 50, 50)'
                };
                font-weight: 500;
            }
            .period-info {
                background-color: #f8f9fa;
                border-radius: 5px;
                padding: 15px;
                margin: 20px 0;
            }
            .period-label {
                font-size: 18px;
                font-weight: bold;
                color: #495057;
                margin-bottom: 5px;
            }
            .company-name {
                color: #6c757d;
                font-size: 14px;
            }
            .button {
                display: inline-block;
                background-color:rgb(4, 88, 178);
                color: #ffffff;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
                text-align: center;
            }
            a.button {
                color: #ffffff;
            }
            .button:hover {
                background-color:rgb(2, 49, 99);
                color: #ffffff;
            }
            .tips-section {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
            }
            .tips-section h4 {
                margin-top: 0;
            }
            .tips-list {
                margin: 0;
                padding-left: 20px;
            }
            .tips-list li {
                margin-bottom: 8px;
            }
            .footer {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #eee;
                font-style: italic;
                color: #666;
                text-align: center;
            }
        </style>
    </head>
    <body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <div class="logo">
                    <img src="https://app.paper-work.nl/assets/img/books_64.png" alt="paperwork logo" />
                    <div>paperwork</div>
                </div>
            </div>
            
            <div class="greeting">
                Beste ${userName},
            </div>

            <div class="deadline-alert ${urgencyClass}">
                <div class="deadline-icon">${
                  isSecondReminder ? '🚨' : '⏰'
                }</div>
                <div class="deadline-title">
                    ${
                      isSecondReminder
                        ? 'Laatste herinnering!'
                        : 'BTW Aangifte Deadline'
                    }
                </div>
                <div class="deadline-date">${deadline}</div>
                <div class="days-remaining">
                    ${
                      daysUntilDeadline === 1
                        ? 'Morgen!'
                        : `Nog ${daysUntilDeadline} dagen`
                    }
                </div>
            </div>

            <div class="period-info">
                <div class="period-label">Periode: ${periodLabel}</div>
                <div class="company-name">${companyName}</div>
            </div>

            <p>
                ${
                  isSecondReminder
                    ? `Dit is uw laatste herinnering voor de BTW aangifte van ${periodLabel}. De deadline is over ${daysUntilDeadline} ${
                        daysUntilDeadline === 1 ? 'dag' : 'dagen'
                      }!`
                    : `De deadline voor uw BTW aangifte van ${periodLabel} nadert. U heeft nog ${daysUntilDeadline} ${
                        daysUntilDeadline === 1 ? 'dag' : 'dagen'
                      } om uw aangifte in te dienen.`
                }
            </p>

            ${
              !isSecondReminder
                ? `
            <div class="tips-section">
                <h4>💡 Handige tips:</h4>
                <ul class="tips-list">
                    <li>Controleer of al uw facturen en uitgaven zijn ingevoerd</li>
                    <li>Download uw BTW export in Excel of CSV formaat</li>
                    <li>Bewaar een kopie van uw export voor uw administratie</li>
                    <li>Dien uw aangifte tijdig in om boetes te voorkomen</li>
                </ul>
            </div>
            `
                : ''
            }

            <div style="text-align: center;">
                <a href="${exportUrl}" class="button">
                    BTW Export Maken
                </a>
            </div>

            <p>
                Heeft u vragen over uw BTW aangifte? Neem dan contact met ons op via onze website.
            </p>

            <div class="footer">
                <p>Dit is een automatisch gegenereerde email van Paperwork.</p>
                <p>Heb je vragen? Neem contact met ons op. <a href="mailto:paperworkdevelopment@gmail.com">paperworkdevelopment@gmail.com</a></p>
            </div>
        </div>
    </div>
    </body>
    </html>
  `
}

export = vatReturnReminderTemplate
