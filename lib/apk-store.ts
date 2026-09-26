import { copyFile, open, rename, stat, writeFile } from 'node:fs/promises'

import { apkMetaPath, apkPath, type ApkMeta } from '@/lib/android-app'

export const MAX_APK_BYTES = 250 * 1024 * 1024
export const MIN_APK_BYTES = 1024 * 1024

/**
 * Check that `file` looks like a real APK (big enough, and an APK is a zip so it starts with
 * "PK\x03\x04"), then make it the file behind the landing page's download button. The old one is
 * kept as `.previous`; the swap is a rename, so a download in progress is not cut off.
 */
export async function publishApk(file: string, meta: ApkMeta): Promise<void> {
  const { size } = await stat(file)
  if (size < MIN_APK_BYTES)
    throw new Error('The file is too small to be the app.')
  if (size > MAX_APK_BYTES) throw new Error('The file is too large.')

  const handle = await open(file, 'r')
  const magic = Buffer.alloc(4)
  try {
    await handle.read(magic, 0, 4, 0)
  } finally {
    await handle.close()
  }
  if (magic.toString('latin1') !== 'PK\x03\x04') {
    throw new Error('That is not an APK file.')
  }

  const target = apkPath()
  await copyFile(target, `${target}.previous`).catch(() => undefined)
  await rename(file, target)
  await writeFile(apkMetaPath(), JSON.stringify(meta, null, 2))
}
