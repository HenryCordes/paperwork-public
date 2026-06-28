/**
 * Export Ready Email Template
 * Dutch language template for notifying users when exports are ready for download
 */

interface ExportReadyData {
  name?: string
  exportType?: string
  downloadUrl?: string
  expiryHours?: number
  companyName?: string
}

const exportReadyTemplate = (data: ExportReadyData): string => {
  const {
    name,
    exportType,
    downloadUrl,
    expiryHours = 2,
    companyName = 'Paperwork',
  } = data

  // Get friendly name for export type
  const typeName =
    exportType === 'expense'
      ? 'kosten'
      : exportType === 'invoice'
        ? 'facturen'
        : 'financiële gegevens'

  return `
    <!DOCTYPE html>
    <html lang="nl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Export gereed - ${companyName}</title>
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
            .expiry-note {
                margin-top: 20px;
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
            
            <h2>Je export is gereed</h2>
            
            <p>Beste ${name || 'gebruiker'},</p>
            
            <p>Je ${typeName} export is succesvol verwerkt en is nu beschikbaar om te downloaden.</p>
            
             <div style="text-align: center;">
                <a href="${downloadUrl}" class="button">
                    Download Export
                </a>
            </div>
            
            <p class="expiry-note">Let op: Deze downloadlink is geldig tot ${expiryHours} uur vanaf nu.</p>
            
            <p>Als je geen export hebt gestart, kun je deze email negeren.</p>
            
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

export = exportReadyTemplate
