import admin from 'firebase-admin'

import { getLogger } from './logger'

const logger = getLogger()

interface PushNotification {
  title?: string
  body?: string
}

interface FirebaseError {
  message?: string
  code?: string
}

class FirebaseService {
  private initialized = false
  private app: admin.app.App | null = null

  initialize(): void {
    if (this.initialized) {
      return
    }

    try {
      const serviceAccount = {
        type: process.env.FIREBASE_TYPE,
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI,
        token_uri: process.env.FIREBASE_TOKEN_URI,
        auth_provider_x509_cert_url:
          process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
      }

      this.app = admin.initializeApp({
        credential: admin.credential.cert(
          serviceAccount as unknown as admin.ServiceAccount,
        ),
        projectId: process.env.FIREBASE_PROJECT_ID,
      })

      this.initialized = true
      logger.info(
        '[FirebaseService] Firebase Admin SDK initialized successfully',
      )
    } catch (error) {
      logger.error(
        '[FirebaseService] Failed to initialize Firebase Admin SDK:',
        error as Record<string, unknown>,
      )
      throw error
    }
  }

  async sendPushNotification(
    token: string,
    notification: PushNotification,
    data: Record<string, unknown> = {},
  ) {
    if (!this.initialized) {
      this.initialize()
    }

    try {
      const stringifiedData: Record<string, string> = {}
      for (const [key, value] of Object.entries(data)) {
        stringifiedData[key] = typeof value === 'string' ? value : String(value)
      }
      stringifiedData.timestamp = Date.now().toString()

      const message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: stringifiedData,
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#1976d2',
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: notification.title,
                body: notification.body,
              },
              sound: 'default',
            },
          },
        },
      } as admin.messaging.Message

      logger.info(
        `[FirebaseService] Sending push notification to token ${token.substring(
          0,
          10,
        )}...`,
        {
          title: notification.title,
          body: notification.body,
        },
      )

      const response = await admin.messaging().send(message)

      logger.info(`[FirebaseService] Push notification sent successfully`, {
        messageId: response,
        token: `${token.substring(0, 10)}...`,
      })

      return {
        success: true,
        messageId: response,
        token: `${token.substring(0, 10)}...`,
      }
    } catch (error) {
      const err = error as FirebaseError
      logger.error(
        `[FirebaseService] Failed to send push notification to token ${token.substring(
          0,
          10,
        )}...`,
        {
          error: err.message,
          errorCode: err.code,
        },
      )

      if (
        err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token'
      ) {
        return {
          success: false,
          error: 'Invalid or expired token',
          shouldRemoveToken: true,
          token: `${token.substring(0, 10)}...`,
        }
      }

      return {
        success: false,
        error: err.message,
        token: `${token.substring(0, 10)}...`,
      }
    }
  }

  async sendMulticastNotification(
    tokens: string[],
    notification: PushNotification,
    data: Record<string, unknown> = {},
  ) {
    if (!this.initialized) {
      this.initialize()
    }

    if (!tokens || tokens.length === 0) {
      logger.warn(
        '[FirebaseService] No tokens provided for multicast notification',
      )
      return { success: false, error: 'No tokens provided' }
    }

    try {
      const message = {
        tokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          ...data,
          timestamp: Date.now().toString(),
        },
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#1976d2',
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: notification.title,
                body: notification.body,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      } as unknown as admin.messaging.MulticastMessage

      logger.info(
        `[FirebaseService] Sending multicast notification to ${tokens.length} tokens`,
        {
          title: notification.title,
          body: notification.body,
          tokenCount: tokens.length,
        },
      )

      const response = await admin.messaging().sendEachForMulticast(message)

      logger.info(`[FirebaseService] Multicast notification sent`, {
        successCount: response.successCount,
        failureCount: response.failureCount,
        totalTokens: tokens.length,
      })

      const invalidTokens: string[] = []
      if (response.responses) {
        response.responses.forEach((resp, idx) => {
          if (
            !resp.success &&
            (resp.error?.code ===
              'messaging/registration-token-not-registered' ||
              resp.error?.code === 'messaging/invalid-registration-token')
          ) {
            invalidTokens.push(tokens[idx])
          }
        })
      }

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens,
        responses: response.responses,
      }
    } catch (error) {
      const err = error as FirebaseError
      logger.error('[FirebaseService] Failed to send multicast notification', {
        error: err.message,
        tokenCount: tokens.length,
      })

      return {
        success: false,
        error: err.message,
        tokenCount: tokens.length,
      }
    }
  }

  async validateToken(token: string) {
    if (!this.initialized) {
      this.initialize()
    }

    try {
      const message = {
        token,
        notification: {
          title: 'Validation',
          body: 'Token validation test',
        },
        data: {
          test: 'true',
        },
      } as admin.messaging.Message

      // Use the dry-run flag to validate without delivering
      await admin.messaging().send(message, true)
      return { valid: true }
    } catch (error) {
      const err = error as FirebaseError
      logger.warn(
        `[FirebaseService] Token validation failed for ${token.substring(
          0,
          10,
        )}...`,
        {
          error: err.message,
          code: err.code,
        },
      )

      return {
        valid: false,
        error: err.message,
        code: err.code,
      }
    }
  }
}

export = new FirebaseService()
