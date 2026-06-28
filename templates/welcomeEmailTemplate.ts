/**
 * Welcome Email Template
 * Dutch language template for welcome emails after subscription
 */

interface WelcomeEmailData {
  name?: string
  plan?: string
  subscriptionDate?: string | number | Date
}

const welcomeEmailTemplate = (data: WelcomeEmailData): string => {
  const { name, plan, subscriptionDate } = data

  // Format date in Dutch style
  const formattedDate = new Date(
    subscriptionDate as string | number | Date,
  ).toLocaleDateString('nl-NL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `
    <!DOCTYPE html>
    <html lang="nl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welkom bij Paperwork</title>
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
                width: 100%;
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
            .subscription-info {
                background-color: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
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
            .features {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
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
        <div class="header">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                    <td align="center">
                        <img src="https://app.paper-work.nl/assets/img/books_64.png" alt="paperwork logo" style="height:60px; width:60px;" />
                        <div style="font-size: 1.8rem; color: #000000;">paperwork</div>
                    </td>
                </tr>
            </table>
        </div>
        <div class="container">
            <div class="greeting">
                Hallo ${name},
            </div>
            
            <p>Bedankt voor je inschrijving bij Paperwork! Wij zijn blij dat je hebt gekozen voor ons platform om je administratie te vereenvoudigen.</p>
            
            <div class="subscription-info">
                <h3>Je abonnement details:</h3>
                <p><strong>Plan:</strong> ${plan}</p>
                <p><strong>Startdatum:</strong> ${formattedDate}</p>
            </div>
            
            <div class="features">
                <h4>Met Paperwork kun je:</h4>
                <ul>
                    <li>Eenvoudig facturen maken en beheren</li>
                    <li>Uitgaven bijhouden</li>
                    <li>Contacten en klanten beheren</li>
                    <li>Financiële overzichten genereren</li>
                    <li>En nog veel meer...</li>
                </ul>
            </div>
            
            <div style="text-align: center;">
                <a href="https://app.paper-work.nl/dashboard" class="button">
                    Ga naar je dashboard
                </a>
            </div>
            
            <p>Heb je vragen of hulp nodig? Aarzel niet om contact met ons op te nemen.</p>
            
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

export = welcomeEmailTemplate
