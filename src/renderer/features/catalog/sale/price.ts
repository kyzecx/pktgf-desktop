/**
 * 价格只保留数字和一个小数点，小数最多两位。
 *
 * 中文输入法常把小数点打成「。」「．」「｡」，这里统一换成英文小数点，
 * 避免用户以为价格不能输入小数。输入框用 sanitize（保留末尾小数点，
 * 方便继续输入），渲染和存档用 normalize（去掉末尾小数点）。
 */
export function sanitizePriceInput(value: string): string {
  const normalized = value.replace(/[。．｡·]/g, '.')
  const cleaned = normalized.replace(/[^\d.]/g, '')
  const [integerPart = '', ...decimalParts] = cleaned.split('.')
  if (decimalParts.length === 0) return integerPart
  const decimal = decimalParts.join('').slice(0, 2)
  return `${integerPart || '0'}.${decimal}`
}

export function normalizePrice(value: string): string {
  return sanitizePriceInput(value).replace(/\.$/, '')
}

/** 价格为空的格子用占位符，避免成品图里出现纯空白。 */
export function displayPrice(value: string): string {
  return normalizePrice(value) || '—'
}
