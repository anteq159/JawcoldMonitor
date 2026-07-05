import api from '../api/client'

// window.open()/plain navigation never carries the app's Authorization
// header (only axios's request interceptor does that), so any endpoint
// behind get_current_user must be downloaded through the authenticated
// `api` client and saved as a blob - not opened as a bare URL.
export async function downloadFile(url: string, fallbackFilename: string): Promise<void> {
  const response = await api.get(url, { responseType: 'blob' })
  const disposition: string | undefined = response.headers?.['content-disposition']
  const match = disposition?.match(/filename=([^;]+)/)
  const filename = match ? match[1].trim() : fallbackFilename

  const blobUrl = URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(blobUrl)
}
