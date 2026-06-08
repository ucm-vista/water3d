/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const openEtCache = new Collection({
    type: "base",
    name: "openet_cache",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: null,
  })

  openEtCache.fields.add(
    new TextField({ name: "cacheKey", required: true, max: 512, presentable: true }),
    new TextField({ name: "endpoint", required: true, max: 240 }),
    new TextField({ name: "variable", required: true, max: 32 }),
    new TextField({ name: "model", required: true, max: 32 }),
    new TextField({ name: "referenceEt", required: true, max: 32 }),
    new TextField({ name: "units", required: true, max: 16 }),
    new NumberField({ name: "version", required: true }),
    new TextField({ name: "interval", required: true, max: 16 }),
    new NumberField({ name: "lat", required: true, min: -90, max: 90 }),
    new NumberField({ name: "lon", required: true, min: -180, max: 180 }),
    new TextField({ name: "startDate", required: true, max: 10, pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    new TextField({ name: "endDate", required: true, max: 10, pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    new JSONField({ name: "request", required: true }),
    new JSONField({ name: "response", required: true }),
    new DateField({ name: "fetchedAt", required: true }),
    new AutodateField({ name: "created", onCreate: true, system: true }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true, system: true }),
  )

  app.save(openEtCache)
  app.db().newQuery("CREATE UNIQUE INDEX idx_openet_cache_key ON openet_cache (cacheKey)").execute()
  app.db().newQuery("CREATE INDEX idx_openet_cache_lookup ON openet_cache (lat, lon, startDate, endDate, variable)").execute()
}, (app) => {
  ;["idx_openet_cache_lookup", "idx_openet_cache_key"].forEach((indexName) => {
    try {
      app.db().newQuery(`DROP INDEX IF EXISTS ${indexName}`).execute()
    } catch (_) {
      // Index already absent.
    }
  })

  try {
    app.delete(app.findCollectionByNameOrId("openet_cache"))
  } catch (_) {
    // Collection already absent.
  }
})
