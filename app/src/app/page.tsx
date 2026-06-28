import Link from 'next/link'
import { Waveform } from '../components/Waveform'

export default function HomePage() {
  return (
    <>
      {/* ---- Hero ------------------------------------------------ */}
      <section className="hero" aria-labelledby="hero-wordmark">
        <div className="hero__waveform" aria-hidden="true">
          <Waveform mode="ambient" aria-label="موجة صوتية تعريفية" />
        </div>

        <div className="hero__content">
          <h1 id="hero-wordmark" className="hero__wordmark">
            غنّيلي
          </h1>
          <p className="hero__tagline">
            أغنية عربية مخصصة، تُكتب بقلمك وتُغنّى بالذكاء الاصطناعي
          </p>
          <Link href="/create" className="btn btn--primary btn--lg hero__cta">
            اصنع أغنيتك
          </Link>
        </div>
      </section>

      {/* ---- How it works --------------------------------------- */}
      <section className="how-it-works" aria-labelledby="how-title">
        <h2 id="how-title" className="how-it-works__title">كيف يعمل؟</h2>
        <ol className="how-it-works__steps" role="list">
          <li className="how-step">
            <span className="how-step__num" aria-hidden="true">١</span>
            <div>
              <h3 className="how-step__heading">أخبرنا القصة</h3>
              <p className="how-step__body">
                المناسبة، المُهدى إليه، واللهجة التي يتحدثها — نريد التفاصيل الحقيقية.
              </p>
            </div>
          </li>
          <li className="how-step">
            <span className="how-step__num" aria-hidden="true">٢</span>
            <div>
              <h3 className="how-step__heading">نؤلّف الأغنية</h3>
              <p className="how-step__body">
                نكتب الكلمات ونلحّن الموسيقى بالذكاء الاصطناعي خلال دقائق.
              </p>
            </div>
          </li>
          <li className="how-step">
            <span className="how-step__num" aria-hidden="true">٣</span>
            <div>
              <h3 className="how-step__heading">أهدِها</h3>
              <p className="how-step__body">
                افتح الأغنية كاملة وشاركها مباشرة — هدية لا تُنسى.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* ---- Footer --------------------------------------------- */}
      <footer className="site-footer" role="contentinfo">
        <p className="site-footer__copy">
          © {new Date().getFullYear()} غنّيلي — جميع الحقوق محفوظة
        </p>
      </footer>
    </>
  )
}
