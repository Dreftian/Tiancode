import type { AsyncStorage } from "@solid-primitives/storage"

export type BlobReference = { id: string; url: string }

type Driver = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  putBlob(blob: Blob): Promise<string>
  getBlob(id: string): Promise<Blob | null>
}

export type DraftStore = AsyncStorage & { putBlob(blob: Blob): Promise<BlobReference> }
const urls = new Map<string, string>()

function blobUrl(id: string, blob: Blob) {
  const existing = urls.get(id)
  if (existing) return existing
  const url = URL.createObjectURL(blob)
  urls.set(id, url)
  return url
}

async function blobID(blob: Blob) {
  const id = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return id
}

export async function createBlobReference(blob: Blob): Promise<BlobReference> {
  const id = await blobID(blob)
  return { id, url: blobUrl(id, blob) }
}

export function createDraftStore(driver: Driver): DraftStore {
  const versions = new Map<string, number>()
  const putBlob = async (blob: Blob) => {
    const id = await driver.putBlob(blob)
    return { id, url: blobUrl(id, blob) }
  }
  const encode = async (value: unknown): Promise<unknown> => {
    if (Array.isArray(value)) return Promise.all(value.map(encode))
    if (!value || typeof value !== "object") return value
    const item = value as Record<string, unknown>
    if (item.type === "image" && typeof item.dataUrl === "string") {
      const blob = await fetch(item.dataUrl).then((response) => response.blob())
      const { dataUrl: _, ...rest } = item
      return { ...rest, blob: { id: await driver.putBlob(blob) } }
    }
    if ("blob" in item && item.blob && typeof item.blob === "object") {
      const blob = item.blob as Record<string, unknown>
      if (typeof blob.id === "string" && blob.id.startsWith("data:")) {
        const data = await fetch(blob.id).then((response) => response.blob())
        return { ...item, blob: { id: await driver.putBlob(data) } }
      }
      return { ...item, blob: { id: blob.id } }
    }
    return Object.fromEntries(
      await Promise.all(Object.entries(item).map(async ([key, entry]) => [key, await encode(entry)])),
    )
  }
  const decode = async (value: unknown): Promise<unknown> => {
    if (Array.isArray(value)) return Promise.all(value.map(decode))
    if (!value || typeof value !== "object") return value
    const item = value as Record<string, unknown>
    if (item.blob && typeof item.blob === "object") {
      const ref = item.blob as Record<string, unknown>
      if (typeof ref.id === "string") {
        const blob = await driver.getBlob(ref.id)
        if (blob) return { ...item, blob: { id: ref.id, url: blobUrl(ref.id, blob) } }
      }
    }
    return Object.fromEntries(
      await Promise.all(Object.entries(item).map(async ([key, entry]) => [key, await decode(entry)])),
    )
  }
  return {
    getItem: async (key) => {
      const value = await driver.get(key)
      return value === null ? null : JSON.stringify(await decode(JSON.parse(value)))
    },
    setItem: async (key, value) => {
      const version = (versions.get(key) ?? 0) + 1
      versions.set(key, version)
      const encoded = JSON.stringify(await encode(JSON.parse(value)))
      if (versions.get(key) === version) await driver.set(key, encoded)
    },
    removeItem: async (key) => {
      versions.set(key, (versions.get(key) ?? 0) + 1)
      await driver.remove(key)
    },
    putBlob,
  }
}

export function createBrowserDraftStore(): DraftStore {
  const request = indexedDB.open("tiancode-drafts", 1)
  request.addEventListener("upgradeneeded", () => {
    request.result.createObjectStore("documents")
    request.result.createObjectStore("blobs")
  })
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    request.addEventListener("success", () => {
      const database = request.result
      const transaction = database.transaction(["documents", "blobs"], "readwrite")
      const documents = transaction.objectStore("documents").getAll()
      documents.addEventListener("success", () => {
        const used = new Set<string>()
        JSON.parse(`[${documents.result.join(",")}]`, (_key, item) => {
          if (item?.blob && typeof item.blob.id === "string") used.add(item.blob.id)
          return item
        })
        const blobs = transaction.objectStore("blobs").openKeyCursor()
        blobs.addEventListener("success", () => {
          const cursor = blobs.result
          if (!cursor) return
          if (!used.has(String(cursor.key))) cursor.delete()
          cursor.continue()
        })
      })
      transaction.addEventListener("complete", () => resolve(database))
      transaction.addEventListener("abort", () => resolve(database))
    })
    request.addEventListener("error", () => reject(request.error))
  })
  const get = async (store: string, key: string) => {
    const result = (await db).transaction(store).objectStore(store).get(key)
    return new Promise<unknown>((resolve, reject) => {
      result.addEventListener("success", () => resolve(result.result))
      result.addEventListener("error", () => reject(result.error))
    })
  }
  const write = async (store: string, key: string, value?: unknown) => {
    const transaction = (await db).transaction(store, "readwrite")
    if (value === undefined) transaction.objectStore(store).delete(key)
    else transaction.objectStore(store).put(value, key)
    return new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve())
      transaction.addEventListener("error", () => reject(transaction.error))
    })
  }
  return createDraftStore({
    get: async (key) => ((await get("documents", key)) as string | undefined) ?? null,
    set: (key, value) => write("documents", key, value),
    remove: (key) => write("documents", key),
    putBlob: async (blob) => {
      const id = await blobID(blob)
      await write("blobs", id, blob)
      return id
    },
    getBlob: async (id) => ((await get("blobs", id)) as Blob | undefined) ?? null,
  })
}

export async function blobDataUrl(blob: BlobReference, mime: string) {
  // 1. Si ya es una data URL, retornarla directamente sin fetch innecesario
  if (typeof blob.url === "string" && blob.url.startsWith("data:")) {
    return blob.url
  }
  if (typeof blob.id === "string" && blob.id.startsWith("data:")) {
    return blob.id
  }

  const readBlob = (b: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener("error", () => reject(reader.error))
      reader.addEventListener("load", () => {
        const value = typeof reader.result === "string" ? reader.result : ""
        resolve(`data:${mime};base64,${value.slice(value.indexOf(",") + 1)}`)
      })
      reader.readAsDataURL(b)
    })

  // 2. Intentar fetch del blob.url si es una URL accesible (blob: o http:)
  if (typeof blob.url === "string" && blob.url.length > 0) {
    try {
      const response = await fetch(blob.url)
      if (response.ok) {
        const data = await response.blob()
        return await readBlob(data)
      }
    } catch {
      // Fallback si fetch no puede resolver la URL (ej. file:// o revoked object URL)
    }
  }

  // 3. Fallback de recuperación directa desde IndexedDB
  if (typeof indexedDB !== "undefined" && typeof blob.id === "string") {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("tiancode-drafts", 1)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const tx = db.transaction("blobs", "readonly")
      const rawBlob = await new Promise<Blob | null>((resolve) => {
        const getReq = tx.objectStore("blobs").get(blob.id)
        getReq.onsuccess = () => resolve((getReq.result as Blob) ?? null)
        getReq.onerror = () => resolve(null)
      })
      if (rawBlob) {
        return await readBlob(rawBlob)
      }
    } catch {
      // IndexedDB fallback no disponible
    }
  }

  // 4. Último recurso: devolver la URL existente o una data URL vacía en vez de fallar
  if (typeof blob.url === "string" && blob.url.length > 0) {
    return blob.url
  }
  return `data:${mime};base64,`
}

export function createLegacyBlobReference(dataUrl: string): BlobReference {
  return { id: dataUrl, url: dataUrl }
}
