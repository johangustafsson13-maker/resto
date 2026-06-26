import type { AppProps } from 'next/app'
import '../styles/globals.css'
import 'dialkit/styles.css' // dev-only panel styling; component render is gated below
import dynamic from 'next/dynamic'

// DialKit is a DEV-ONLY shadow-tuning panel. It uses browser APIs (client-side
// only) and must never render in production. `next/dynamic` + the NODE_ENV guard
// below let the bundler tree-shake it out of the production build entirely.
const isDev = process.env.NODE_ENV !== 'production'

const DialRoot = isDev
  ? dynamic(() => import('dialkit').then(m => m.DialRoot), { ssr: false })
  : () => null

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      {isDev && <DialRoot position="bottom-right" theme="dark" />}
    </>
  )
}
