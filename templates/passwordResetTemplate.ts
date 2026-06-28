/**
 * Password Reset Email Template
 * Dutch language template for password reset emails
 */

interface PasswordResetData {
  name?: string
  resetToken?: string
  resetUrl?: string
  expiryMinutes?: number | string
}

const passwordResetTemplate = (data: PasswordResetData): string => {
  const { name, resetToken, resetUrl, expiryMinutes } = data

  return `
    <!DOCTYPE html>
    <html lang="nl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Wachtwoord Reset - Paperwork</title>
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
            .reset-code {
                background-color: #f8f9fa;
                border: 2px dashed rgb(50, 50, 50);
                padding: 20px;
                text-align: center;
                margin: 20px 0;
                border-radius: 8px;
            }
            .code {
                font-size: 32px;
                font-weight: bold;
                color:rgb(50, 50, 50);
                letter-spacing: 4px;
                font-family: 'Courier New', monospace;
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
            .instructions {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
            }
            .warning {
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
            
            <div class="greeting">
                Hallo ${name},
            </div>
            
            <p>We hebben een verzoek ontvangen om je wachtwoord te wijzigen voor je Paperwork account.</p>
            
            <div class="reset-code">
                <p>Je reset code is:</p>
                <div class="code">${resetToken}</div>
            </div>
            
            <div class="instructions">
                <h4>Instructies:</h4>
                <ol>
                    <li>Klik op de onderstaande knop om naar de reset pagina te gaan</li>
                    <li>Voer je email adres in</li>
                    <li>Voer de reset code hierboven in</li>
                    <li>Kies een nieuw wachtwoord</li>
                </ol>
            </div>
            
            <div style="text-align: center;">
                <a href="${resetUrl}" class="button">
                    Wachtwoord Reset
                </a>
            </div>
            
            <div class="warning">
                Deze reset code is ${expiryMinutes} minuten geldig.
            </div>
            
            <p>Als je dit verzoek niet hebt gedaan, kun je deze email negeren. Je wachtwoord blijft dan ongewijzigd.</p>
            
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

export = passwordResetTemplate
