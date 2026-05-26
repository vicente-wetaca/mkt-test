import { listMergedMRs } from './src/gitlab-client'

async function main() {
  try {
    const list = await listMergedMRs({ since: '2026-04-01', until: '2026-05-01' })
    console.log('count:', list.length)
    console.log('first:', list[0]?.iid, list[0]?.title)
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main()
