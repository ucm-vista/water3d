/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  const cropTypes = new Collection({
    type: "base",
    name: "crop_types",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  cropTypes.fields.add(
    new TextField({ name: "key", required: true, max: 64, pattern: "^[A-Za-z][A-Za-z0-9_]*$" }),
    new TextField({ name: "label", required: true, max: 120, presentable: true }),
    new TextField({ name: "varietyHint", max: 120 }),
    new NumberField({ name: "tBaseC", required: true }),
    new NumberField({ name: "tUpperC", required: true }),
    new NumberField({ name: "madFraction", required: true, min: 0, max: 1 }),
    new NumberField({ name: "rootDepthM", required: true, min: 0 }),
    new NumberField({ name: "tawMmPerM", required: true, min: 0 }),
    new NumberField({ name: "chillRequirementPortions", min: 0 }),
    new JSONField({ name: "kcCurve", required: true }),
    new JSONField({ name: "stages", required: true }),
    new JSONField({ name: "stress", required: true }),
    new BoolField({ name: "active" }),
    new AutodateField({ name: "created", onCreate: true, system: true }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true, system: true }),
  )
  app.save(cropTypes)

  const soilTypes = new Collection({
    type: "base",
    name: "soil_types",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  soilTypes.fields.add(
    new RelationField({ name: "owner", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true }),
    new TextField({ name: "name", required: true, max: 120, presentable: true }),
    new TextField({ name: "texture", required: true, max: 120 }),
    new NumberField({ name: "awhcMmPerM", required: true, min: 0 }),
    new TextField({ name: "mapUnitKey", max: 80 }),
    new TextField({ name: "mapUnitName", max: 240 }),
    new TextField({ name: "componentName", max: 160 }),
    new NumberField({ name: "componentPercent", min: 0, max: 100 }),
    new TextField({ name: "hydrologicGroup", max: 20 }),
    new TextField({ name: "drainageClass", max: 120 }),
    new NumberField({ name: "lat" }),
    new NumberField({ name: "lon" }),
    new TextField({ name: "source", required: true, max: 80 }),
    new JSONField({ name: "metadata" }),
    new AutodateField({ name: "created", onCreate: true, system: true }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true, system: true }),
  )
  app.save(soilTypes)
  setOwnerRules(app, "soil_types")

  const fields = new Collection({
    type: "base",
    name: "fields",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  fields.fields.add(
    new RelationField({ name: "owner", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true }),
    new TextField({ name: "name", required: true, max: 120, presentable: true }),
    new TextField({ name: "cropId", required: true, max: 64 }),
    new TextField({ name: "cropLabel", required: true, max: 160 }),
    new RelationField({ name: "cropType", collectionId: cropTypes.id, maxSelect: 1 }),
    new NumberField({ name: "lat", required: true, min: -90, max: 90 }),
    new NumberField({ name: "lon", required: true, min: -180, max: 180 }),
    new TextField({ name: "soilTexture", required: true, max: 120 }),
    new NumberField({ name: "awhcMmPerM", required: true, min: 0 }),
    new RelationField({ name: "soilType", collectionId: soilTypes.id, maxSelect: 1 }),
    new TextField({ name: "soilMapUnitKey", max: 80 }),
    new TextField({ name: "soilMapUnitName", max: 240 }),
    new TextField({ name: "soilComponentName", max: 160 }),
    new NumberField({ name: "soilComponentPercent", min: 0, max: 100 }),
    new TextField({ name: "hydrologicGroup", max: 20 }),
    new TextField({ name: "drainageClass", max: 120 }),
    new NumberField({ name: "rootDepthM", required: true, min: 0 }),
    new NumberField({ name: "madFraction", required: true, min: 0, max: 1 }),
    new TextField({ name: "stageStartDate", required: true, max: 10, pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    new NumberField({ name: "irrigationEfficiency", required: true, min: 0, max: 1 }),
    new TextField({ name: "weatherCell", required: true, max: 160 }),
    new NumberField({ name: "elevationFt" }),
    new JSONField({ name: "metadata" }),
    new AutodateField({ name: "created", onCreate: true, system: true }),
    new AutodateField({ name: "updated", onCreate: true, onUpdate: true, system: true }),
  )
  app.save(fields)
  setOwnerRules(app, "fields")

  app.db().newQuery("CREATE UNIQUE INDEX idx_crop_types_key ON crop_types (key)").execute()
  app.db().newQuery("CREATE INDEX idx_crop_types_active ON crop_types (active)").execute()
  app.db().newQuery("CREATE INDEX idx_soil_types_owner ON soil_types (owner)").execute()
  app.db().newQuery("CREATE INDEX idx_soil_types_texture ON soil_types (texture)").execute()
  app.db().newQuery("CREATE INDEX idx_soil_types_map_unit_key ON soil_types (mapUnitKey)").execute()
  app.db().newQuery("CREATE INDEX idx_fields_owner ON fields (owner)").execute()
  app.db().newQuery("CREATE INDEX idx_fields_crop_id ON fields (cropId)").execute()
  app.db().newQuery("CREATE INDEX idx_fields_location ON fields (lat, lon)").execute()

  seedCropTypes(app, cropTypes)
}, (app) => {
  ;[
    "idx_fields_location",
    "idx_fields_crop_id",
    "idx_fields_owner",
    "idx_soil_types_map_unit_key",
    "idx_soil_types_texture",
    "idx_soil_types_owner",
    "idx_crop_types_active",
    "idx_crop_types_key",
  ].forEach((indexName) => {
    try {
      app.db().newQuery(`DROP INDEX IF EXISTS ${indexName}`).execute()
    } catch (_) {
      // Index already absent.
    }
  })

  ;["fields", "soil_types", "crop_types"].forEach((name) => {
    try {
      app.delete(app.findCollectionByNameOrId(name))
    } catch (_) {
      // Collection already absent.
    }
  })
})

function setOwnerRules(app, collectionName) {
  const collection = app.findCollectionByNameOrId(collectionName)
  collection.listRule = "@request.auth.id != '' && owner = @request.auth.id"
  collection.viewRule = "@request.auth.id != '' && owner = @request.auth.id"
  collection.createRule = "@request.auth.id != '' && @request.body.owner = @request.auth.id"
  collection.updateRule = "@request.auth.id != '' && owner = @request.auth.id"
  collection.deleteRule = "@request.auth.id != '' && owner = @request.auth.id"
  app.save(collection)
}

function seedRecord(app, collection, data) {
  const record = new Record(collection)
  Object.entries(data).forEach(([key, value]) => record.set(key, value))
  app.save(record)
}

function seedCropTypes(app, collection) {
  seedRecord(app, collection, {
    key: "almond",
    label: "Almond",
    varietyHint: "Nonpareil",
    tBaseC: 4.5,
    tUpperC: 30,
    madFraction: 0.4,
    rootDepthM: 1.5,
    tawMmPerM: 150,
    chillRequirementPortions: 65,
    kcCurve: [
      { position: 0, kc: 0.4 },
      { position: 0.35, kc: 1.15 },
      { position: 0.75, kc: 1.15 },
      { position: 1, kc: 0.9 },
    ],
    stages: [
      { label: "Bloom", gdd: 250 },
      { label: "Nut Fill", gdd: 950 },
      { label: "Hull Split", gdd: 2000 },
      { label: "Harvest", gdd: 2700 },
    ],
    stress: { frostCriticalC: -2, heatCriticalC: 38, highVpdKpa: 2.5 },
    active: true,
  })

  seedRecord(app, collection, {
    key: "tomato",
    label: "Processing Tomato",
    tBaseC: 10,
    tUpperC: 30,
    madFraction: 0.4,
    rootDepthM: 1,
    tawMmPerM: 150,
    kcCurve: [
      { position: 0, kc: 0.3 },
      { position: 0.45, kc: 1.15 },
      { position: 0.8, kc: 1.15 },
      { position: 1, kc: 0.7 },
    ],
    stages: [
      { label: "Flowering", gdd: 450 },
      { label: "Fruit Set", gdd: 700 },
      { label: "Red Ripe", gdd: 1400 },
    ],
    stress: { frostCriticalC: 0, heatCriticalC: 35, highVpdKpa: 2.5 },
    active: true,
  })

  seedRecord(app, collection, {
    key: "wineGrape",
    label: "Wine Grape",
    tBaseC: 10,
    tUpperC: 30,
    madFraction: 0.5,
    rootDepthM: 1.5,
    tawMmPerM: 130,
    chillRequirementPortions: 50,
    kcCurve: [
      { position: 0, kc: 0.3 },
      { position: 0.45, kc: 0.7 },
      { position: 0.8, kc: 0.7 },
      { position: 1, kc: 0.45 },
    ],
    stages: [
      { label: "Budbreak", gdd: 0 },
      { label: "Bloom", gdd: 350 },
      { label: "Veraison", gdd: 1400 },
      { label: "Harvest", gdd: 2200 },
    ],
    stress: { frostCriticalC: -1, heatCriticalC: 35, highVpdKpa: 2.5 },
    active: true,
  })

  seedRecord(app, collection, {
    key: "alfalfa",
    label: "Alfalfa",
    tBaseC: 5,
    tUpperC: 30,
    madFraction: 0.5,
    rootDepthM: 2,
    tawMmPerM: 140,
    kcCurve: [
      { position: 0, kc: 0.4 },
      { position: 0.5, kc: 0.95 },
      { position: 1, kc: 0.9 },
    ],
    stages: [
      { label: "Green-up", gdd: 0 },
      { label: "Canopy", gdd: 350 },
      { label: "Cutting Window", gdd: 700 },
    ],
    stress: { highVpdKpa: 2.5 },
    active: true,
  })
}
