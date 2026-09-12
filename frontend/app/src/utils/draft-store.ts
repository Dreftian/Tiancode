import type { AsyncStorage } from "@solid-primitives/storage"

export type BlobReference = { id: string; url: string }

export class BlobUnavailableError extends Error {
  constructor(readonly blobID: string) {
    super(`Attachment ${blobID} is no longer available`)
    this.name = "BlobUnavailableError"
  }
}

type Driver = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  putBlob(blob: Blob): Promise<string>
  getBlob(id: string): Promise<Blob | null>
}

export type DraftStore = AsyncStorage & {
  putBlob(blob: Blob): Promise<BlobReference>
  getBlob(id: string): Promise<Blob | null>
}
const urls = new Map<string, string>()
// El Blob vive en memoria mientras dure el draft, así que guardarlo aquí evita
// depender de que su object URL siga resolviendo al convertirlo a data URL.
const blobs = new Map<string, Blob>()

function blobUrl(id: string, blob: Blob) {
  blobs.set(id, blob)
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
    getBlob: (id) => driver.getBlob(id),
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

export async function blobDataUrl(blob: BlobReference, mime: string, getBlob?: (id: string) => Promise<Blob | null>) {
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

  // 2. El Blob original, que sigue en memoria mientras el draft exista
  const cached = typeof blob.id === "string" ? blobs.get(blob.id) : undefined
  if (cached) return await readBlob(cached)

  // 3. Draft restaurado tras recargar: solo el driver del store conserva el blob
  if (getBlob && typeof blob.id === "string") {
    const stored = await getBlob(blob.id).catch(() => null)
    if (stored) return await readBlob(stored)
  }

  // 4. Último intento: resolver el object URL, que puede estar ya revocado
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

  // Devolver la blob: URL o una data URL vacía solo movía el fallo al proveedor,
  // que responde con un 400 opaco. Fallar aquí deja el motivo a la vista.
  throw new BlobUnavailableError(blob.id)
}

export function createLegacyBlobReference(dataUrl: string): BlobReference {
  return { id: dataUrl, url: dataUrl }
}
