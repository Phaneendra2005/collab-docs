import { describe, it, expect, beforeEach } from 'vitest'
import { LamportClock } from '../lamport-clock'

describe('LamportClock', () => {
  it('initializes to 0 or provided value', () => {
    const clock1 = new LamportClock('doc1')
    expect(clock1.current()).toBe(0)

    const clock2 = new LamportClock('doc2', 5)
    expect(clock2.current()).toBe(5)
  })

  it('increments correctly', () => {
    const clock = new LamportClock('doc1')
    expect(clock.increment()).toBe(1)
    expect(clock.increment()).toBe(2)
    expect(clock.current()).toBe(2)
  })

  it('updates correctly on receive', () => {
    const clock = new LamportClock('doc1', 5)

    // Receiving smaller clock doesn't change it, just increments
    expect(clock.merge(3)).toBe(6)
    expect(clock.current()).toBe(6)

    // Receiving larger clock updates to larger + 1
    expect(clock.merge(10)).toBe(11)
    expect(clock.current()).toBe(11)
  })

  it('maintains isolated clocks per document session', () => {
    const clockA = new LamportClock('docA', 1)
    const clockB = new LamportClock('docB', 10)

    expect(clockA.increment()).toBe(2)
    expect(clockB.increment()).toBe(11)

    clockA.merge(20)
    expect(clockA.current()).toBe(21)
    expect(clockB.current()).toBe(11) // B is unaffected
  })
})
