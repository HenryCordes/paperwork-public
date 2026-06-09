const API_BASE_URL = process.env.REACT_APP_API_URL || ''

class AuthService {
  async getCurrentUser() {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        return null
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const result = await response.json()
        return result.data
      } else if (response.status === 401) {
        // Token is invalid, remove it
        localStorage.removeItem('token')
        return null
      } else {
        throw new Error('Fout bij ophalen gebruikersgegevens')
      }
    } catch (error) {
      console.error('AuthService getCurrentUser error:', error)
      throw error
    }
  }

  async login(email: string, password: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const result = await response.json()

      if (response.ok) {
        if (result.token) {
          localStorage.setItem('token', result.token)
        }
        return result
      } else {
        throw new Error(result.message || 'Inloggen mislukt')
      }
    } catch (error) {
      console.error('AuthService login error:', error)
      throw error
    }
  }

  logout() {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  getToken() {
    return localStorage.getItem('token')
  }

  isAuthenticated() {
    const token = this.getToken()
    return !!token
  }
}

export const authService = new AuthService()
export default authService
