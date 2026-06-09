import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import SideBar from '../../components/Sidebar/SideBar'
import VATReturnExport from '../../components/VATReturnExport/VATReturnExport'
import { authService } from '../../services/authService'
import './Taxes.css'

const Taxes = () => {
  const [user, setUser] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('btw')
  const navigate = useNavigate()

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userData = await authService.getCurrentUser()
        if (!userData) {
          navigate('/login')
          return
        }
        setUser(userData)
      } catch (error) {
        console.error('Fout bij ophalen gebruikersgegevens:', error)
        navigate('/login')
      } finally {
        setLoading(false)
      }
    }

    fetchUserData()
  }, [navigate])

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">Laden...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="belasting-container">
      <SideBar />
      <div className="body-content content-wrapper belasting">
        <h2 className="icon-portfolio short" title="Belasting">
          {' '}
        </h2>

        <div className="belasting-tabs">
          <button
            className={`tab-button ${activeTab === 'btw' ? 'active' : ''}`}
            onClick={() => setActiveTab('btw')}
          >
            BTW Aangifte
          </button>
          <button
            className={`tab-button ${
              activeTab === 'inkomsten' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('inkomsten')}
            disabled
            title="Binnenkort beschikbaar"
          >
            Inkomstenbelasting
          </button>
          <button
            className={`tab-button ${activeTab === 'historie' ? 'active' : ''}`}
            onClick={() => setActiveTab('historie')}
            disabled
            title="Binnenkort beschikbaar"
          >
            Geschiedenis
          </button>
        </div>

        <div className="belasting-content">
          {activeTab === 'btw' && (
            <div className="tab-content">
              <div className="tab-header">
                <h2>BTW Aangifte Export</h2>
                <p>
                  Exporteer uw BTW gegevens voor maandelijkse, kwartaal of
                  jaarlijkse aangiftes. Alle bedragen worden automatisch
                  berekend op basis van uw facturen en uitgaven.
                </p>
              </div>
              <VATReturnExport user={user} />
            </div>
          )}

          {activeTab === 'inkomsten' && (
            <div className="tab-content">
              <div className="tab-header">
                <h2>Inkomstenbelasting Export</h2>
                <p>
                  Binnenkort beschikbaar - Exporteer uw jaarlijkse inkomsten en
                  uitgaven voor de inkomstenbelasting.
                </p>
              </div>
              <div className="coming-soon">
                <div className="coming-soon-icon">📊</div>
                <h3>Binnenkort beschikbaar</h3>
                <p>
                  De inkomstenbelasting export functionaliteit wordt binnenkort
                  toegevoegd. Deze functie zal een complete jaaroverzicht
                  genereren van al uw inkomsten, uitgaven en winst/verlies
                  berekeningen.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'historie' && (
            <div className="tab-content">
              <div className="tab-header">
                <h2>Export Geschiedenis</h2>
                <p>Bekijk en download eerder gegenereerde belasting exports.</p>
              </div>
              <div className="coming-soon">
                <div className="coming-soon-icon">📋</div>
                <h3>Binnenkort beschikbaar</h3>
                <p>
                  Hier kunt u binnenkort een overzicht zien van al uw eerder
                  gegenereerde BTW aangiftes en andere belasting exports,
                  inclusief grafieken en trends.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Taxes
