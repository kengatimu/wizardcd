import JSZip from 'jszip'

/**
 * Detects whether a JAR file is a fat JAR (Spring Boot with BOOT-INF/) or thin JAR.
 * Returns 'fat' if BOOT-INF/ entries are found, 'thin' otherwise.
 */
export async function detectJarType(file: File): Promise<'fat' | 'thin'> {
  const zip = await JSZip.loadAsync(file)
  const hasBOOTINF = Object.keys(zip.files).some((n) => n.startsWith('BOOT-INF/'))
  return hasBOOTINF ? 'fat' : 'thin'
}
