import { describe, expect, test } from "bun:test"
import { installSystemCaTrust, installWindowsSystemCaTrust, type NodeTlsCaApi } from "./windows-system-ca"

// Raíces autofirmadas generadas para el test: DEFAULT_PEM y SYSTEM_PEM caducan
// en 2126, EXPIRED_PEM caducó el 2021-01-01.
const DEFAULT_PEM = `-----BEGIN CERTIFICATE-----
MIIDKTCCAhGgAwIBAgIUGuFErI52LGLnKnVhg1lJn+/vH4MwDQYJKoZIhvcNAQEL
BQAwIzEhMB8GA1UEAwwYVGlhbmNvZGUgVGVzdCBWYWxpZCBSb290MCAXDTI2MDkx
MzA0MTAyMFoYDzIxMjYwODIwMDQxMDIwWjAjMSEwHwYDVQQDDBhUaWFuY29kZSBU
ZXN0IFZhbGlkIFJvb3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCn
pc5jHNHHAtkYb/sCO/ZWIRAytYj1R03qXvx9Vjqwpm8pYTRNptTAOzoEVNTM+h1l
u8LP7P8QyY6oc9ebw73cGkxb/tMXUjnLZmaBC55NRcYwNsoB6lzlasNOLfQnHu0P
khd0t72LR7XDMbk7MT2DzjZocvZw03qs5f3PD2OcFriW7XFozUN+gSd514MGeNnD
G4lDAhFYRU9r0NLILuLEWhi/Hlwb5ueQpFC4jhya28t6MG4W/AepTV5ovewq+ca1
m/RsQhgWg4jOFyZWdneZq1fk5oSzxnW9PKrDU75abyj+NKclVFh6KN2MSbxwNB05
razolYAsKBdTsZKkjZmHAgMBAAGjUzBRMB0GA1UdDgQWBBSCOtu8q4mc1g/yE9Wj
CiPZviYL1DAfBgNVHSMEGDAWgBSCOtu8q4mc1g/yE9WjCiPZviYL1DAPBgNVHRMB
Af8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBwoRfKpKQAUiKLHNGWh6OhSrYl
mQQZHdtRY1Tj6B9ACvgtNEVMpRXvUQrwNms2SDRVq8NM+OW3w6JQbTFytfHXxpds
qqZ0uZxh4xBNh7FiIcXgoUvJortmdwWOONlSfqjzV3ZsfcZrfr3YsRxxGV6h3PTn
BiAKEJK+QPmXaTKJpbCBiPL3JtedLga1pOhpho3eZKNa7/qAgihZPkQfM9yCeWIw
+tQtDZ1NzLwMQBrgKZWZb36SomfaGJ/atxRseY5hrWfIx6X2eSVveGZUh/GPqkNc
bxdA84UlHvfj/NM0SuChM5pILOQNug+w/dia13GqqYCkNP82nVVq55RtiRfW
-----END CERTIFICATE-----
`

const SYSTEM_PEM = `-----BEGIN CERTIFICATE-----
MIIDKzCCAhOgAwIBAgIURH/ef4nYZaweCE/naL+gyg5MsqAwDQYJKoZIhvcNAQEL
BQAwJDEiMCAGA1UEAwwZVGlhbmNvZGUgVGVzdCBTeXN0ZW0gUm9vdDAgFw0yNjA5
MTMwNDE2MjJaGA8yMTI2MDgyMDA0MTYyMlowJDEiMCAGA1UEAwwZVGlhbmNvZGUg
VGVzdCBTeXN0ZW0gUm9vdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
AJY45n+1vJZ1ZKr91xQDPyODIz9t6Rf/LZRxMyVYU3ql4bVACQLIakoRknpRu0nH
kkuwJ7k0l+xi+XpF4M/KLQyDcsgFpNP7xMXKF0tXQgCQSVj9rO9WbPZ/IziWFYle
oYTk3GtPCEB18j9z7h/xIN6zqS7wzTjZ+3tji+EOSAII1h1ghBpYbSRMGjke9Vb7
5ce7ll+FidqYE/E0S2wiQ8i7JUfUVjKIkSEllF+6pHtKyFHJTzSumq8Su9jolMcn
hXIUe7ACGb9y8SxPpt2pV3Jz4b34xEIIIXa/INlh0a/tEXLNwZ6RtJ/F6VLW8Cgd
gZs6nbCHt7GE8HjuRYypqTUCAwEAAaNTMFEwHQYDVR0OBBYEFF5mM8H6PW672J/l
Kv+mulPWH30nMB8GA1UdIwQYMBaAFF5mM8H6PW672J/lKv+mulPWH30nMA8GA1Ud
EwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAF5LkGhjoscn/hfzCww1krt0
IJMus5EbIcxRh6aNpEJVWdmEPwQOz05GdVrH/KDZbkz93y/3ejVqP4TFLOP+4QEa
DruiiFutRsvt9/YxjpNS+b5ZItioq3XZvEiMICSrANK3npvb5T6jct5MFPD07VH+
wsZVdALZjdNDwbVfoDyQkQmLzn8sZ1YWQLaJpavAWb2zeCPsRGX2cZaVQdFtByzM
cE0QGQiqsfTGDKoHZf3MQOoGi1PzFjkbgJCBEDVHq8X8AZeii5AYyeomwI04VGjF
ftGU4fKfs9xerlS/VYeDtZOMOThiYHw/yIYCzokXlD3w6Zu+YAslj1VG9t+aOXA=
-----END CERTIFICATE-----
`

const EXPIRED_PEM = `-----BEGIN CERTIFICATE-----
MIIDKzCCAhOgAwIBAgIUM1yv/kGs/y2nahAOW4EcTGI8+pYwDQYJKoZIhvcNAQEL
BQAwJTEjMCEGA1UEAwwaVGlhbmNvZGUgVGVzdCBFeHBpcmVkIFJvb3QwHhcNMjAw
MTAxMDAwMDAwWhcNMjEwMTAxMDAwMDAwWjAlMSMwIQYDVQQDDBpUaWFuY29kZSBU
ZXN0IEV4cGlyZWQgUm9vdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
AKtbZXXfmqekiQbpyYcrnQVxJWRne652OAI0eOcA4tObo/QCaBg/oAGTUnUSeqSR
BDGnsBPs8sjuit3VM9sRYQ6SRL6jFB4TMz3JfVUWZHwKXnhohGY7c+DYSTli0xcY
WUeWJ9sZGzwDJb6qbbC6tFfKa2s7k+uqnU6wD5JUwWjSQ8gE+Qk08teSvzqL8zlN
hUXqpGXE8/PlQxBYQQmk1o0VIxZy6uFgX5HgLzLTyX1lGliAbT9lVAO/m7RGS9f7
1t6SKJfjMvRlazaMPVVoyqPM9WUGSI4NJpiFeWX37hQrhnEukqiyF4JKMsZQUsfD
r6lOY3+U218mmzv+5SrjMiUCAwEAAaNTMFEwHQYDVR0OBBYEFKyo/w0qcijTEoZo
6eA5+l9o5TZxMB8GA1UdIwQYMBaAFKyo/w0qcijTEoZo6eA5+l9o5TZxMA8GA1Ud
EwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAHnnCAE13JlF+TbkwlF78YSe
Qhadu72L3pTWZ44CL+d6kW/4vP/zr8mlWTly/2tqOCtJrnOhsNQTXbCF4cZrhcel
ly/cCcqPHn6/+lFHEyb1TtE1IeeZmIwvMnnMG1Jnn+zwJuAYGFngoH67ls9J75p7
5fwIXWhQxGkF+GG6XnfmBq/zUP1qcUXHcaDiUrftSQLuCFar5/0W1KQgLO7y/mND
ScKlHX16YKJYAGDiZhdnkrNW+G9mD4MZoxAL4YJx9mjiyrpTizP2fgO3xlsY9MEa
nQas07i/vK2wb8SYIClY2LhKgBUkPR3jEj5ktrNOA57lzbJ7QaRF1y1Kyop9L2s=
-----END CERTIFICATE-----
`

function fakeTls(certificates: { default: string[]; system: string[] }) {
  const applied: string[][] = []
  const api: NodeTlsCaApi = {
    getCACertificates: (type) => (type === "system" ? certificates.system : certificates.default),
    setDefaultCACertificates: (list) => {
      applied.push(list)
    },
  }
  return { api, applied }
}

describe("windows system CA trust", () => {
  test("does nothing outside windows", () => {
    const tls = fakeTls({ default: [DEFAULT_PEM], system: [SYSTEM_PEM] })

    const result = installWindowsSystemCaTrust({ tls: tls.api, platform: "darwin" })

    expect(result.applied).toBe(false)
    expect(result.outcome).toBe("not-windows")
    expect(tls.applied).toEqual([])
  })

  test("does nothing when the runtime lacks the CA APIs", () => {
    const log: string[] = []

    const result = installWindowsSystemCaTrust({
      tls: {},
      platform: "win32",
      log: (message) => log.push(message),
    })

    expect(result.applied).toBe(false)
    expect(result.outcome).toBe("unsupported-runtime")
    expect(log).toHaveLength(1)
  })

  test("appends the system store after node defaults", () => {
    const tls = fakeTls({ default: [DEFAULT_PEM], system: [SYSTEM_PEM] })

    const result = installWindowsSystemCaTrust({ tls: tls.api, platform: "win32" })

    expect(result.applied).toBe(true)
    expect(result.systemCertificateCount).toBe(1)
    expect(result.totalCertificateCount).toBe(2)
    expect(tls.applied).toEqual([[DEFAULT_PEM, SYSTEM_PEM]])
  })

  test("drops expired certificates so openssl cannot pick an expired chain", () => {
    const tls = fakeTls({ default: [DEFAULT_PEM], system: [EXPIRED_PEM, SYSTEM_PEM] })

    const result = installWindowsSystemCaTrust({ tls: tls.api, platform: "win32" })

    expect(result.applied).toBe(true)
    expect(result.droppedCertificateCount).toBe(1)
    expect(result.systemCertificateCount).toBe(1)
    expect(tls.applied).toEqual([[DEFAULT_PEM, SYSTEM_PEM]])
  })

  test("drops duplicates by fingerprint, not by PEM text", () => {
    // Mismo certificado, distinto formato de texto: el dedupe por cadena no lo
    // detectaría, el de huella sí.
    const reformatted = `${DEFAULT_PEM.trim()}\n\n`
    const tls = fakeTls({ default: [DEFAULT_PEM], system: [reformatted, SYSTEM_PEM] })

    const result = installWindowsSystemCaTrust({ tls: tls.api, platform: "win32" })

    expect(result.droppedCertificateCount).toBe(1)
    expect(tls.applied).toEqual([[DEFAULT_PEM, SYSTEM_PEM]])
  })

  test("keeps certificates node cannot parse", () => {
    const tls = fakeTls({ default: [DEFAULT_PEM], system: ["not a certificate"] })

    const result = installWindowsSystemCaTrust({ tls: tls.api, platform: "win32" })

    expect(result.applied).toBe(true)
    expect(tls.applied).toEqual([[DEFAULT_PEM, "not a certificate"]])
  })

  test("skips the merge when the system store is empty", () => {
    const tls = fakeTls({ default: [DEFAULT_PEM], system: [] })

    const result = installWindowsSystemCaTrust({ tls: tls.api, platform: "win32" })

    expect(result.applied).toBe(false)
    expect(result.outcome).toBe("no-system-certificates")
    expect(tls.applied).toEqual([])
  })

  test("never throws out when the TLS API throws", () => {
    const log: { message: string; level: string }[] = []
    const failing: NodeTlsCaApi = {
      getCACertificates: () => {
        throw new Error("store unavailable")
      },
      setDefaultCACertificates: () => {},
    }

    const result = installWindowsSystemCaTrust({
      tls: failing,
      platform: "win32",
      log: (message, _extra, level) => log.push({ message, level }),
    })

    expect(result.applied).toBe(false)
    expect(result.outcome).toBe("failed")
    expect(result.error).toBe("store unavailable")
    expect(log).toEqual([{ message: "failed to install windows system certificates", level: "warn" }])
  })

  // `main` corre con `Effect.runFork` sin manejador de errores: un throw
  // síncrono desde aquí deja la app sin ventana y sin diálogo.
  test("never throws out when the logger itself throws", () => {
    const exploding = () => {
      throw new Error("logger down")
    }

    const unsupported = () =>
      installWindowsSystemCaTrust({ tls: {}, platform: "win32", log: exploding })
    const applied = () =>
      installWindowsSystemCaTrust({
        tls: fakeTls({ default: [DEFAULT_PEM], system: [SYSTEM_PEM] }).api,
        platform: "win32",
        log: exploding,
      })
    const failing = () =>
      installWindowsSystemCaTrust({
        tls: {
          getCACertificates: () => {
            throw new Error("store unavailable")
          },
          setDefaultCACertificates: () => {},
        },
        platform: "win32",
        log: exploding,
      })

    expect(unsupported().outcome).toBe("unsupported-runtime")
    expect(applied().outcome).toBe("applied")
    expect(failing().outcome).toBe("failed")
  })

  test("applies the certificates even when the logger throws", () => {
    const tls = fakeTls({ default: [DEFAULT_PEM], system: [SYSTEM_PEM] })

    installWindowsSystemCaTrust({
      tls: tls.api,
      platform: "win32",
      log: () => {
        throw new Error("logger down")
      },
    })

    expect(tls.applied).toEqual([[DEFAULT_PEM, SYSTEM_PEM]])
  })

  test("never throws out when applying the certificates throws", () => {
    const failing: NodeTlsCaApi = {
      getCACertificates: (type) => (type === "system" ? [SYSTEM_PEM] : [DEFAULT_PEM]),
      setDefaultCACertificates: () => {
        throw new Error("cannot set")
      },
    }

    const result = installWindowsSystemCaTrust({ tls: failing, platform: "win32" })

    expect(result.outcome).toBe("failed")
    expect(result.error).toBe("cannot set")
  })
})

describe("macOS/Linux system CA trust", () => {
  // `setDefaultCACertificates([])` deja el proceso con CERO raíces: todo TLS
  // falla. Si falta la API de lectura no hay nada que mezclar, así que la
  // confianza se deja como estaba en vez de borrarla.
  test("never applies an empty list when the read API is missing", () => {
    const applied: string[][] = []
    const log: { message: string; level: string }[] = []

    const result = installSystemCaTrust({
      tls: { setDefaultCACertificates: (list) => applied.push(list) },
      log: (message, _extra, level) => log.push({ message, level }),
    })

    expect(result.applied).toBe(false)
    expect(result.outcome).toBe("unsupported-runtime")
    expect(applied).toEqual([])
    expect(log).toEqual([{ message: "system certificates unsupported by this runtime", level: "warn" }])
  })

  test("never applies an empty list when the system store is empty", () => {
    const tls = fakeTls({ default: [], system: [] })

    const result = installSystemCaTrust({ tls: tls.api })

    expect(result.outcome).toBe("no-system-certificates")
    expect(tls.applied).toEqual([])
  })

  test("merges node defaults with the system store and logs it", () => {
    const tls = fakeTls({ default: [DEFAULT_PEM], system: [SYSTEM_PEM, DEFAULT_PEM] })
    const log: string[] = []

    const result = installSystemCaTrust({ tls: tls.api, log: (message) => log.push(message) })

    expect(result.applied).toBe(true)
    expect(result.totalCertificateCount).toBe(2)
    expect(tls.applied).toEqual([[DEFAULT_PEM, SYSTEM_PEM]])
    expect(log).toEqual(["system certificates installed"])
  })

  test("never throws out when the TLS API or the logger throws", () => {
    const result = installSystemCaTrust({
      tls: {
        getCACertificates: () => {
          throw new Error("store unavailable")
        },
        setDefaultCACertificates: () => {},
      },
      log: () => {
        throw new Error("logger down")
      },
    })

    expect(result.outcome).toBe("failed")
    expect(result.error).toBe("store unavailable")
  })
})
