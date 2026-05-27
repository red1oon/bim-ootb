#!/bin/bash
# setup-test-data.sh — Download test databases from OCI for Playwright tests
# Run once after cloning repo: cd tests && ./setup-test-data.sh

set -e

BUILDINGS_DIR="../sandbox/buildings"
OCI_BASE="https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/buildings"

echo "Setting up test data for Playwright tests..."
echo ""

# Create buildings directory
mkdir -p "$BUILDINGS_DIR"

# Check if Duplex DBs already exist
if [ -f "$BUILDINGS_DIR/Duplex_extracted.db" ] && [ -f "$BUILDINGS_DIR/Duplex_library.db" ]; then
  echo "✓ Test DBs already exist:"
  ls -lh "$BUILDINGS_DIR"/Duplex_*.db
  echo ""
  echo "Run tests: npx playwright test --grep @fast"
  exit 0
fi

echo "Downloading Duplex test building (1.1MB extracted + 117B library)..."
echo ""

# Download Duplex_extracted.db
if [ ! -f "$BUILDINGS_DIR/Duplex_extracted.db" ]; then
  echo "Downloading Duplex_extracted.db..."
  curl -# -o "$BUILDINGS_DIR/Duplex_extracted.db" "$OCI_BASE/Duplex_extracted.db"
  echo "✓ Downloaded Duplex_extracted.db"
else
  echo "✓ Duplex_extracted.db already exists"
fi

# Download Duplex_library.db
if [ ! -f "$BUILDINGS_DIR/Duplex_library.db" ]; then
  echo "Downloading Duplex_library.db..."
  curl -# -o "$BUILDINGS_DIR/Duplex_library.db" "$OCI_BASE/Duplex_library.db"
  echo "✓ Downloaded Duplex_library.db"
else
  echo "✓ Duplex_library.db already exists"
fi

echo ""
echo "✓ Test data ready!"
echo ""
echo "Verify DB integrity:"
sqlite3 "$BUILDINGS_DIR/Duplex_extracted.db" "SELECT COUNT(*) || ' elements' FROM element_instances;" 2>/dev/null || echo "  (install sqlite3 to verify)"
echo ""
echo "Run tests:"
echo "  cd tests"
echo "  npx playwright test --grep @fast          # Fast tests only (~60s)"
echo "  npx playwright test 41-streaming-contract # Contract validation"
echo "  npx playwright test                       # Full suite (~5min)"
