import { renderHook, act } from '@testing-library/react'
import { usePresence } from './usePresence'
import { Editor } from '@tiptap/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('usePresence', () => {
  let mockSocket: any
  let mockEditor: any

  beforeEach(() => {
    vi.useFakeTimers()
    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      connected: true,
    }
    mockEditor = {
      state: {
        selection: { from: 0, to: 0 },
        tr: {
          setMeta: vi.fn().mockReturnThis(),
        },
      },
      view: {
        dispatch: vi.fn(),
      },
      on: vi.fn(),
      off: vi.fn(),
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('initializes with empty collaborators', () => {
    const { result } = renderHook(() =>
      usePresence(mockSocket, 'doc-1', mockEditor as unknown as Editor),
    )
    expect(result.current.collaborators).toEqual([])
    expect(result.current.isTypingLocal).toBe(false)
  })

  it('handles room:joined event to set active users', () => {
    const { result } = renderHook(() =>
      usePresence(mockSocket, 'doc-1', mockEditor as unknown as Editor),
    )

    act(() => {
      const onRoomJoined = mockSocket.on.mock.calls.find((c: any) => c[0] === 'room:joined')[1]
      onRoomJoined('doc-1', [{ actorId: 'user-1', color: '#ff0000', avatar: null }])
    })

    expect(result.current.collaborators.length).toBe(1)
    expect(result.current.collaborators[0].actorId).toBe('user-1')
  })

  it('handles presence:broadcast event to add or update collaborator', () => {
    const { result } = renderHook(() =>
      usePresence(mockSocket, 'doc-1', mockEditor as unknown as Editor),
    )

    act(() => {
      const onPresenceBroadcast = mockSocket.on.mock.calls.find(
        (c: any) => c[0] === 'presence:broadcast',
      )[1]
      onPresenceBroadcast({
        actorId: 'user-1',
        color: '#ff0000',
        selection: { start: 5, end: 10 },
        lastActivity: Date.now(),
      })
    })

    expect(result.current.collaborators.length).toBe(1)
    expect(result.current.collaborators[0].selection).toEqual({ start: 5, end: 10 })
    // Check if TipTap decorations were updated
    expect(mockEditor.state.tr.setMeta).toHaveBeenCalled()
    expect(mockEditor.view.dispatch).toHaveBeenCalled()
  })

  it('handles presence:leave event to remove collaborator', () => {
    const { result } = renderHook(() =>
      usePresence(mockSocket, 'doc-1', mockEditor as unknown as Editor),
    )

    act(() => {
      const onPresenceBroadcast = mockSocket.on.mock.calls.find(
        (c: any) => c[0] === 'presence:broadcast',
      )[1]
      onPresenceBroadcast({ actorId: 'user-1', color: '#ff0000', lastActivity: Date.now() })
    })

    expect(result.current.collaborators.length).toBe(1)

    act(() => {
      const onPresenceLeave = mockSocket.on.mock.calls.find(
        (c: any) => c[0] === 'presence:leave',
      )[1]
      onPresenceLeave('user-1')
    })

    expect(result.current.collaborators.length).toBe(0)
  })

  it('emits presence:update when local editor selection changes', () => {
    renderHook(() => usePresence(mockSocket, 'doc-1', mockEditor as unknown as Editor))

    act(() => {
      const onSelectionUpdate = mockEditor.on.mock.calls.find(
        (c: any) => c[0] === 'selectionUpdate',
      )[1]
      mockEditor.state.selection = { from: 10, to: 15 }
      onSelectionUpdate()
    })

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'presence:update',
      expect.objectContaining({
        documentId: 'doc-1',
        selection: { start: 10, end: 15 },
      }),
    )
  })

  it('throttles cursor updates if selection is identical', () => {
    renderHook(() => usePresence(mockSocket, 'doc-1', mockEditor as unknown as Editor))

    mockSocket.emit.mockClear()

    act(() => {
      const onSelectionUpdate = mockEditor.on.mock.calls.find(
        (c: any) => c[0] === 'selectionUpdate',
      )[1]
      mockEditor.state.selection = { from: 10, to: 15 }
      onSelectionUpdate()
      onSelectionUpdate() // duplicate call
    })

    // Should only be emitted once due to shallow equality check in hook
    expect(mockSocket.emit).toHaveBeenCalledTimes(1)
  })

  it('sets isTypingLocal and debounces broadcast', () => {
    const { result } = renderHook(() =>
      usePresence(mockSocket, 'doc-1', mockEditor as unknown as Editor),
    )

    act(() => {
      const onTransaction = mockEditor.on.mock.calls.find((c: any) => c[0] === 'transaction')[1]
      onTransaction({ transaction: { docChanged: true } })
    })

    expect(result.current.isTypingLocal).toBe(true)

    // Initial emit from mounting might have happened, but let's check debouncing
    mockSocket.emit.mockClear()

    // Fast-forward useDebounce timer (500ms)
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'presence:update',
      expect.objectContaining({
        isTyping: true,
      }),
    )

    // Fast-forward local typing timeout (2000ms from transaction)
    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(result.current.isTypingLocal).toBe(false)
  })
})
