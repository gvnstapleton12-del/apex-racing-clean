export async function retry(fn, retries = 3, baseDelay = 1000) {
  let lastError
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const delay = Math.pow(2, i) * baseDelay + Math.floor(Math.random() * baseDelay)
      console.log(`[retry] Attempt ${i + 1}/${retries} failed, retrying in ${delay}ms: ${err.message}`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastError
}
