// The few operating-system functions the C++ engine's WebAssembly module asks for.
//
// It was built for WASI (the standard way for WebAssembly to reach an operating system),
// and its C++ library expects an environment, standard output and a way to exit. The
// engine uses none of them for its work, so these just answer "nothing there": no
// environment variables, and anything written to the console is discarded.

const ESPIPE = 70 // "illegal seek", the answer for a stream like a console

export function createWasiImports(getMemory: () => WebAssembly.Memory) {
  const view = () => new DataView(getMemory().buffer)

  return {
    wasi_snapshot_preview1: {
      environ_sizes_get(countPointer: number, sizePointer: number) {
        view().setUint32(countPointer, 0, true)
        view().setUint32(sizePointer, 0, true)
        return 0
      },
      environ_get() {
        return 0
      },
      fd_close() {
        return 0
      },
      fd_seek() {
        return ESPIPE
      },
      // Report everything as written, so nothing waits on it, and throw the text away
      fd_write(_fd: number, iovsPointer: number, iovsLength: number, writtenPointer: number) {
        const memory = view()
        let written = 0
        for (let i = 0; i < iovsLength; i++) written += memory.getUint32(iovsPointer + 8 * i + 4, true)
        memory.setUint32(writtenPointer, written, true)
        return 0
      },
      proc_exit(code: number) {
        throw new Error(`The C++ engine tried to exit (code ${code})`)
      },
    },
  }
}
