import { describe, expect, it } from 'vitest'
import { isLocalNetworkAddress, normalizeHost } from './config'

describe('isLocalNetworkAddress (what an HTTPS page may reach with local-network permission)', () => {
  it('accepts private IPv4 literals and .local names', () => {
    for (const h of ['192.168.1.106', '10.0.0.5', '172.16.0.1', '172.31.255.1', '169.254.1.1', 'wled-a1b2c3.local', '192.168.1.106:80'])
      expect(isLocalNetworkAddress(h), h).toBe(true)
  })
  it("rejects public addresses, including WLED's AP address 4.3.2.1", () => {
    for (const h of ['4.3.2.1', '172.32.0.1', '8.8.8.8', 'lamp.lan', 'example.com']) expect(isLocalNetworkAddress(h), h).toBe(false)
  })
  it('normalises pasted URLs', () => {
    expect(normalizeHost(' http://192.168.1.106/ ')).toBe('192.168.1.106')
  })
})
