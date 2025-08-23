// lib/imageValidator.ts
const FALLBACK_IMG = "https://placehold.co/800x450?text=No+Image";

// 画像URL検証キャッシュ（メモリ）
const imageValidationCache = new Map<string, { isValid: boolean; timestamp: number }>();
const VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5分

export async function validateImageUrl(url: string): Promise<string> {
  if (!url || url === FALLBACK_IMG) return url;

  // Discord CDN URLでない場合はそのまま返す
  if (!url.includes('cdn.discordapp.com')) return url;

  // キャッシュをチェック
  const cached = imageValidationCache.get(url);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < VALIDATION_CACHE_TTL) {
    return cached.isValid ? url : FALLBACK_IMG;
  }

  try {
    // HEAD リクエストで画像の存在をチェック
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒タイムアウト

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store'
    });

    clearTimeout(timeoutId);

    const isValid = response.ok;
    
    // 結果をキャッシュ
    imageValidationCache.set(url, { isValid, timestamp: now });
    
    return isValid ? url : FALLBACK_IMG;
    
  } catch (error) {
    console.log(`[imageValidator] Image validation failed for ${url}: ${error}`);
    
    // エラー時はinvalidとしてキャッシュ
    imageValidationCache.set(url, { isValid: false, timestamp: now });
    
    return FALLBACK_IMG;
  }
}

// 複数の画像URLを並行して検証
export async function validateImageUrls(urls: string[]): Promise<string[]> {
  const promises = urls.map(url => validateImageUrl(url));
  return Promise.all(promises);
}

// キャッシュクリア機能
export function clearImageValidationCache() {
  imageValidationCache.clear();
  console.log('[imageValidator] Cache cleared');
}