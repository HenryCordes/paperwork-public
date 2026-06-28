import { CSSProperties } from 'react'

/**
 * Simple loading spinner component
 */
const LoadingSpinner = () => {
  const spinnerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100px',
    margin: '20px auto',
    textAlign: 'center',
  }

  return (
    <div style={spinnerStyle}>
      <div className="spinner-border text-primary" role="status">
        <span className="sr-only">Loading...</span>
      </div>
    </div>
  )
}

export default LoadingSpinner
