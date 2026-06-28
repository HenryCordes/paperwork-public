import Footer from '../../components/Footer/Footer'

const About = () => {
  return (
    <div className="body-content content-wrapper">
      <div className="content-centered padding-top-15">
        <h2>Over paperwork</h2>
        <br />
        <h3>Wat is paperwork en waarom heb ik het nodig?</h3>
        <p>
          paperwork is een administratieve applicatie voor kleinere
          ondernemingen die snel en eenvoudig klanten en contactmomenten willen
          registreren en zich geen zorgen willen maken om het samenstellen van
          en factuur, paperwork zorgt ervoor dat deze handelingen snel,
          betrouwbaar en eenvoudig te realiseren zijn.
        </p>

        <h3>Hoe werkt het</h3>
        <p>
          paperwork biedt een abonnement waardoor je administratie eenvoudig en
          betrouwbaar af te handelen is, de laatste technieken en methodieken
          worden ingezet, zodat jij je kunt focussen op datgene waar je mee
          bezig wilt zijn: de zorg voor je klant.
        </p>

        <h3>Abonnement</h3>
        <p>
          Geen ingewikkelde installaties, of randvoorwaarden, maar gewoon een
          website via de browser, altijd bereikbaar, met zorg gemaakt en
          onderhouden. Je neemt alleen een abonnement af, alle technische zaken
          worden voor je geregeld.
        </p>
        <a href="mailto:paperworkdevelopment@gmail.com?subject=Aanmelden voor paperwork">
          Mail om aan te melden
        </a>

        <h3>Wensen</h3>
        <p>
          Ook al doen wij ons best alles zo eenvoudig mogelijk te houden, het
          kan altijd zijn dat je wensen hebt waardoor paperwork nog beter kan
          worden, laat het ons weten, want wij horen het graag. Misschien zie je
          jou wens sneller als feature verschijnen dan je denkt!
        </p>
        <a href="mailto:paperworkdevelopment@gmail.com?subject=Wens voor paperwork">
          Mail om je wens aan ons duidelijk te maken
        </a>
      </div>
      <div className="no-sidebar">
        <Footer />
      </div>
    </div>
  )
}

export default About
