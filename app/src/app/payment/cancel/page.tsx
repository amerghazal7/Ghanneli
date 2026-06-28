import Link from 'next/link'

export default function PaymentCancelPage() {
  return (
    <main className="payment-page">
      <div className="payment-page__card">
        <span className="payment-page__icon payment-page__icon--muted" aria-hidden="true">✕</span>
        <h1 className="payment-page__title">لم يكتمل الدفع</h1>
        <p className="payment-page__body">
          لا بأس — لم يُسحب أي مبلغ. يمكنك المحاولة مجدداً أو الاحتفاظ بالمقطع التجريبي.
        </p>
        <Link href="/create" className="btn btn--ghost btn--lg">
          العودة
        </Link>
      </div>
    </main>
  )
}
