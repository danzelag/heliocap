import { createSign } from 'crypto'

const DEFAULT_GOOGLE_CLOUD_LOCATION = 'us-central1'
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

type CachedAccessToken = {
  token: string
  expiresAt: number
}

let cachedAccessToken: CachedAccessToken | null = null

export function getGoogleCloudProjectId() {
  return getRequiredGoogleCloudEnv('GOOGLE_CLOUD_PROJECT_ID')
}

export function getGoogleCloudLocation() {
  return process.env.GOOGLE_CLOUD_LOCATION || DEFAULT_GOOGLE_CLOUD_LOCATION
}

export async function getGoogleCloudAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return cachedAccessToken.token
  }

  const clientEmail = getRequiredGoogleCloudEnv('GOOGLE_CLOUD_CLIENT_EMAIL')
  const privateKey = getRequiredGoogleCloudEnv('GOOGLE_CLOUD_PRIVATE_KEY').replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)
  const assertion = signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: clientEmail,
      scope: CLOUD_PLATFORM_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    privateKey,
  )

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google service account auth failed: ${res.status} ${text.slice(0, 240)}`)
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) {
    throw new Error('Google service account auth failed: no access token returned')
  }

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }

  return cachedAccessToken.token
}

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: string) {
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${base64Url(signer.sign(privateKey))}`
}

function base64UrlJson(value: Record<string, unknown>) {
  return base64Url(Buffer.from(JSON.stringify(value)))
}

function base64Url(value: Buffer) {
  return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function getRequiredGoogleCloudEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}
