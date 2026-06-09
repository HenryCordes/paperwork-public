export interface Plan {
  id: string
  name: string
  description: string
  price: string
  priceNL: string
  currency: string
  interval: string
  intervalNL: string
}

export const availablePlans: Plan[] = [
  {
    id: 'essentials',
    name: 'Essentials',
    description: 'Maand abonnement voor 1 gebruiker',
    price: '9.99',
    priceNL: '9,99',
    currency: 'EUR',
    interval: '1 month',
    intervalNL: 'Betaal per maand',
  },
  {
    id: 'essentials yearly',
    name: 'Essentials Year',
    description: 'Jaar abonnement (2 maanden bespaard)',
    price: '99.99',
    priceNL: '99,99',
    currency: 'EUR',
    interval: '12 months',
    intervalNL: 'Betaal per jaar',
  },
]
