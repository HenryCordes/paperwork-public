/**
 * Formats price for Dutch locale (comma as decimal separator)
 * @param {string|number} price - The price to format
 * @param {string} defaultValue - Default value if price is undefined/null
 * @returns {string} Formatted price with comma as decimal separator
 */
export const formatDutchPrice = (
  price?: string | number | null,
  defaultValue = '9,99',
) => {
  if (price === undefined || price === null || price === '') {
    return defaultValue
  }

  // Convert to string, replace dots with commas
  return String(price).replace('.', ',')
}

export const formatDate = (dateString?: string | number | Date | null) => {
  if (!dateString) return 'nvt'
  const date = new Date(dateString)
  return date.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export const translatePlanInterval = (interval?: string) => {
  switch (interval) {
    case '1 month':
      return 'Betaal per maand'
    case '12 months':
      return 'Betaal per jaar'
    case '1 year':
      return 'Betaal per jaar'
    default:
      return interval
  }
}
