import Link from 'next/link'

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug } = await searchParams
  const songHref = slug ? `/song/${slug}` : '/create'

  return (
    <main className="payment-page">
      <div className="payment-page__card">
        <span className="payment-page__icon" aria-hidden="true">✓</span>
        <h1 className="payment-page__title">تمّت عملية الدفع بنجاح!</h1>
        <p className="payment-page__body">
          رصيدك جاهز — يمكنك الآن فتح أغنيتك كاملة.
        </p>
        <Link href={songHref} className="btn btn--primary btn--lg">
          {slug ? 'افتح الأغنية كاملة' : 'العودة إلى الأغنية'}
        </Link>
      </div>
    </main>
  )
}
