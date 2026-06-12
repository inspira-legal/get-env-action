import { describe, it, expect } from 'vitest'
import { globToRegExp, isAllowed } from '../src/filter'
import { parseList } from '../src/inputs'

describe('globToRegExp', () => {
  it('matches literal names case-insensitively', () => {
    expect(globToRegExp('API_URL').test('api_url')).toBe(true)
    expect(globToRegExp('API_URL').test('API_KEY')).toBe(false)
  })

  it('supports * wildcard', () => {
    expect(globToRegExp('AWS_*').test('AWS_REGION')).toBe(true)
    expect(globToRegExp('AWS_*').test('GCP_REGION')).toBe(false)
  })

  it('supports ? single-char wildcard', () => {
    expect(globToRegExp('VAR_?').test('VAR_1')).toBe(true)
    expect(globToRegExp('VAR_?').test('VAR_12')).toBe(false)
  })

  it('escapes regex metacharacters in the literal parts', () => {
    expect(globToRegExp('A.B').test('A.B')).toBe(true)
    expect(globToRegExp('A.B').test('AxB')).toBe(false)
  })
})

describe('isAllowed', () => {
  it('includes everything when include is empty', () => {
    expect(isAllowed('ANYTHING', [], [])).toBe(true)
  })

  it('honors include patterns', () => {
    expect(isAllowed('AWS_REGION', ['AWS_*'], [])).toBe(true)
    expect(isAllowed('GCP_REGION', ['AWS_*'], [])).toBe(false)
  })

  it('exclude wins over include', () => {
    expect(isAllowed('AWS_SECRET', ['AWS_*'], ['*_SECRET'])).toBe(false)
    expect(isAllowed('AWS_REGION', ['AWS_*'], ['*_SECRET'])).toBe(true)
  })
})

describe('parseList', () => {
  it('splits on commas and newlines and trims', () => {
    expect(parseList('A, B\nC ,  ,D')).toEqual(['A', 'B', 'C', 'D'])
  })

  it('returns empty array for empty input', () => {
    expect(parseList('')).toEqual([])
    expect(parseList('  \n , ')).toEqual([])
  })
})
