import { createDEM, analyseTerrain, slope, elevationAt } from '../src/lib/terrain.ts'

let failures = 0
const ok = (name: string, condition: boolean, extra = '') => {
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${name}${extra ? '  ' + extra : ''}`)
  if (!condition) failures++
}

const N = 41
const box = { south: 59.0, north: 59.02, west: 17.0, east: 17.02 }

// 1. Flat surface
{
  const z = new Float32Array(N * N).fill(100)
  const t = analyseTerrain(createDEM(box, N, N, z))
  const middle = 20 * N + 20
  ok('flat surface: slope ~0', t.slopeDegrees[middle]! < 0.01, `${t.slopeDegrees[middle]!.toFixed(4)}°`)
  ok('flat surface: TWI finite', isFinite(t.twi[middle]!), `TWI=${t.twi[middle]!.toFixed(2)}`)
}

// 2. Evenly sloping plane towards the south (elevation falls southward => faces S)
{
  const z = new Float32Array(N * N)
  const dem0 = createDEM(box, N, N, z)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) z[r * N + c] = 100 - r * (dem0.cellY * 0.1)
  const dem = createDEM(box, N, N, z)
  const l = slope(dem, 20, 20)
  ok('10% slope: ~5.71°', Math.abs(l.degrees - 5.71) < 0.1, `${l.degrees.toFixed(2)}°`)
  ok('slope faces south (180°)', Math.abs(l.aspect! - 180) < 1, `${l.aspect!.toFixed(1)}°`)
}

// 3. Slope towards the east
{
  const z = new Float32Array(N * N)
  const dem0 = createDEM(box, N, N, z)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) z[r * N + c] = 100 - c * (dem0.cellX * 0.1)
  const dem = createDEM(box, N, N, z)
  const l = slope(dem, 20, 20)
  ok('slope faces east (90°)', Math.abs(l.aspect! - 90) < 1, `${l.aspect!.toFixed(1)}°`)
}

// 4. V-shaped valley: TWI should be highest in the bottom, lowest on the crests
{
  const z = new Float32Array(N * N)
  const dem0 = createDEM(box, N, N, z)
  const middleC = (N - 1) / 2
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      // valley running north-south, tilting gently southward so water has an outlet
      z[r * N + c] = 100 + Math.abs(c - middleC) * dem0.cellX * 0.15 - r * dem0.cellY * 0.02
  const t = analyseTerrain(createDEM(box, N, N, z))
  const row = 30
  const twiValley = t.twi[row * N + middleC]!
  const twiCrest = t.twi[row * N + 2]!
  ok('valley floor wetter than crest', twiValley > twiCrest + 1.5, `valley=${twiValley.toFixed(2)} crest=${twiCrest.toFixed(2)}`)
  ok('TWI grows downstream in the valley', t.twi[35 * N + middleC]! > t.twi[5 * N + middleC]!,
     `${t.twi[5 * N + middleC]!.toFixed(2)} -> ${t.twi[35 * N + middleC]!.toFixed(2)}`)
}

// 5. A sink without an outlet must not create infinities
{
  const z = new Float32Array(N * N).fill(100)
  z[20 * N + 20] = 80
  const t = analyseTerrain(createDEM(box, N, N, z))
  ok('sink: all TWI finite', t.twi.every((v) => isFinite(v)))
}

// 6. Bilinear interpolation
{
  const z = new Float32Array(N * N)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) z[r * N + c] = c
  const dem = createDEM(box, N, N, z)
  const h = elevationAt(dem, 59.01, (box.west + box.east) / 2)
  ok('bilinear middle = (N-1)/2', Math.abs(h - (N - 1) / 2) < 0.01, `${h.toFixed(3)}`)
}

console.log(failures ? `\n${failures} test misslyckades` : '\nAlla terrängtester gröna')
process.exit(failures ? 1 : 0)
