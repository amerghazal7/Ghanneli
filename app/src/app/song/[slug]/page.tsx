import { notFound } from 'next/navigation'
import { getDb } from '../../../server/db/client'
import { SharePageContent, getShareSong } from './share-content'

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const song = await getShareSong(slug, getDb())
  if (!song) notFound()

  return (
    <SharePageContent
      status={song.status}
      previewUri={song.previewUri ?? undefined}
      fullUri={song.fullUri ?? undefined}
      songId={song.id}
      unlocked={song.unlocked}
    />
  )
}
