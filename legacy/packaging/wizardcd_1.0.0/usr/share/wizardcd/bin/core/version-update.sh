#!/bin/bash
# ==================================================
# WizardCD - Version Update Script
# Purpose:
#   Safely update both the DEBIAN/control version and
#   the usr/share/wizardcd/VERSION file before building
#   a new .deb package.
#
# Usage:
#   ./version-update.sh <new_version>
#
# Example:
#   ./version-update.sh 1.1.0
#
# Notes:
#   - Automatically updates both version fields.
#   - Does not change other metadata or rebuild automatically.
#   - Run `dpkg-deb --build wizardcd_<new_version>` afterwards.
# ==================================================

set -e

NEW_VERSION="$1"

# --------------------------------------------------
# Validate input
# --------------------------------------------------
if [[ -z "$NEW_VERSION" ]]; then
  echo "Usage: $0 <new_version>"
  echo "Example: $0 1.1.0"
  exit 1
fi

# Detect the package directory (wizardcd_<version> or existing)
PKG_DIR=$(find . -maxdepth 1 -type d -name "wizardcd_*" | head -n 1)

if [[ -z "$PKG_DIR" ]]; then
  echo "No wizardcd_<version> directory found in current path."
  exit 1
fi

# --------------------------------------------------
# Update DEBIAN/control
# --------------------------------------------------
CONTROL_FILE="${PKG_DIR}/DEBIAN/control"
if [[ -f "$CONTROL_FILE" ]]; then
  echo "Updating package version in control file..."
  sed -i.bak "s/^Version:.*/Version: ${NEW_VERSION}-1/" "$CONTROL_FILE"
  rm -f "${CONTROL_FILE}.bak"
else
  echo "Control file not found: $CONTROL_FILE"
fi

# --------------------------------------------------
# Update usr/share/wizardcd/VERSION
# --------------------------------------------------
VERSION_FILE="${PKG_DIR}/usr/share/wizardcd/VERSION"
if [[ -f "$VERSION_FILE" ]]; then
  echo "$NEW_VERSION" > "$VERSION_FILE"
  echo "Updated VERSION file: $VERSION_FILE"
else
  echo "VERSION file not found: $VERSION_FILE"
fi

# --------------------------------------------------
# Summary
# --------------------------------------------------
echo
echo "Version successfully updated to ${NEW_VERSION}"
echo "Next steps:"
echo "  1. Verify changes:"
echo "       cat ${VERSION_FILE}"
echo "       grep Version ${CONTROL_FILE}"
echo "  2. Rebuild the .deb package:"
echo "       dpkg-deb --build ${PKG_DIR}"
echo
