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
