import { skapaDEM, analyseraTerrang, lutning, hojdVid } from '../src/lib/terrang.ts'

let fel = 0
const ok = (namn: string, villkor: boolean, extra = '') => {
  console.log(`${villkor ? '  ok  ' : ' FAIL '} ${namn}${extra ? '  ' + extra : ''}`)
  if (!villkor) fel++
}

const N = 41
const box = { south: 59.0, north: 59.02, west: 17.0, east: 17.02 }

// 1. Plan yta
{
  const z = new Float32Array(N * N).fill(100)
  const t = analyseraTerrang(skapaDEM(box, N, N, z))
  const mitt = 20 * N + 20
  ok('plan yta: lutning ~0', t.lutningGrader[mitt]! < 0.01, `${t.lutningGrader[mitt]!.toFixed(4)}°`)
  ok('plan yta: TWI finit', isFinite(t.twi[mitt]!), `TWI=${t.twi[mitt]!.toFixed(2)}`)
}

// 2. Jämnt sluttande plan mot söder (höjd minskar söderut => lutar mot S)
{
  const z = new Float32Array(N * N)
  const dem0 = skapaDEM(box, N, N, z)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) z[r * N + c] = 100 - r * (dem0.cellY * 0.1)
  const dem = skapaDEM(box, N, N, z)
  const l = lutning(dem, 20, 20)
  ok('sluttning 10%: ~5.71°', Math.abs(l.grader - 5.71) < 0.1, `${l.grader.toFixed(2)}°`)
  ok('sluttning lutar mot söder (180°)', Math.abs(l.vaderstreck! - 180) < 1, `${l.vaderstreck!.toFixed(1)}°`)
}

// 3. Sluttning mot öster
{
  const z = new Float32Array(N * N)
  const dem0 = skapaDEM(box, N, N, z)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) z[r * N + c] = 100 - c * (dem0.cellX * 0.1)
  const dem = skapaDEM(box, N, N, z)
  const l = lutning(dem, 20, 20)
  ok('sluttning lutar mot öster (90°)', Math.abs(l.vaderstreck! - 90) < 1, `${l.vaderstreck!.toFixed(1)}°`)
}

// 4. V-formad dal: TWI ska vara högst i botten, lägst på krönen
{
  const z = new Float32Array(N * N)
  const dem0 = skapaDEM(box, N, N, z)
  const mittC = (N - 1) / 2
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      // dal längs nord-syd, lutar svagt söderut så vattnet har utlopp
      z[r * N + c] = 100 + Math.abs(c - mittC) * dem0.cellX * 0.15 - r * dem0.cellY * 0.02
  const t = analyseraTerrang(skapaDEM(box, N, N, z))
  const rad = 30
  const twiDal = t.twi[rad * N + mittC]!
  const twiKron = t.twi[rad * N + 2]!
  ok('dalbotten blötare än krön', twiDal > twiKron + 1.5, `dal=${twiDal.toFixed(2)} krön=${twiKron.toFixed(2)}`)
  ok('TWI ökar nedströms i dalen', t.twi[35 * N + mittC]! > t.twi[5 * N + mittC]!,
     `${t.twi[5*N+mittC]!.toFixed(2)} -> ${t.twi[35*N+mittC]!.toFixed(2)}`)
}

// 5. Sänka utan utlopp får inte skapa oändligheter
{
  const z = new Float32Array(N * N).fill(100)
  z[20 * N + 20] = 80
  const t = analyseraTerrang(skapaDEM(box, N, N, z))
  ok('sänka: alla TWI finita', t.twi.every((v) => isFinite(v)))
}

// 6. Bilinjär interpolering
{
  const z = new Float32Array(N * N)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) z[r * N + c] = c
  const dem = skapaDEM(box, N, N, z)
  const h = hojdVid(dem, 59.01, (box.west + box.east) / 2)
  ok('bilinjär mitt = (N-1)/2', Math.abs(h - (N - 1) / 2) < 0.01, `${h.toFixed(3)}`)
}

console.log(fel ? `\n${fel} test misslyckades` : '\nAlla terrängtester gröna')
process.exit(fel ? 1 : 0)
