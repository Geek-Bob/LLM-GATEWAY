export interface LogDebugInfo {
  client: {
    body: string
    apiFormat: string
  }
  route: {
    providerName: string
    providerType: string
    baseUrl: string
    modelName: string
  }
  conversion?: {
    from: string
    to: string
    originalPath: string
    convertedPath: string
    originalModel: string
    convertedModel: string
  }
  upstream: {
    url: string
    body: string
    statusCode: number
    responseBody: string
  }
}

export interface UpdateInfo {
  version: string
  releaseNotes?: string | null
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface UpdateCheckResult {
  available: boolean
  version?: string
  error?: string
}

export interface UpdateConfig {
  autoCheck: boolean
  checkInterval: number
  allowPrerelease: boolean
  skipVersion: string | null
}
