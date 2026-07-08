#!/usr/bin/env bash

# Colors for printing
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== SIM Broadband Manager Package Build Script ===${NC}"

# Extract version dynamically from tauri.conf.json
VERSION=$(grep '"version":' sim/src-tauri/tauri.conf.json | head -n 1 | cut -d '"' -f 4)
if [ -z "$VERSION" ]; then
  VERSION="3.0.0"
fi

echo -e "${BLUE}Target Version: ${VERSION}${NC}"

# Track build results
RUST_BUILD="Failed"
TAURI_BUILD="Skipped"
RPM_BUILD="Skipped"
FLATPAK_BUILD="Skipped"
SNAP_BUILD="Skipped"

# Step 1: Pre-build the Rust binary in release mode
echo -e "\n${YELLOW}Step 1: Compiling Rust backend binary...${NC}"
cd sim/src-tauri
if cargo build --release; then
  RUST_BUILD="Success"
  echo -e "${GREEN}Backend compiled successfully: target/release/sim${NC}"
else
  RUST_BUILD="Failed"
  echo -e "${RED}Rust compilation failed. Exiting build script.${NC}"
  exit 1
fi
cd ../..

# Step 2: Build Tauri Native Packages (.deb, .AppImage)
echo -e "\n${YELLOW}Step 2: Building Tauri native packages (Debian & AppImage)...${NC}"
if cargo tauri --version &> /dev/null; then
  cd sim/src-tauri
  # Run and allow continuation on AppImage/FUSE bundling failures
  if cargo tauri build --bundles deb,appimage; then
    TAURI_BUILD="Success"
  else
    # Check if at least DEB was bundled
    if [ -d "target/release/bundle/deb" ] && [ "$(ls -A target/release/bundle/deb)" ]; then
      TAURI_BUILD="Partial (Debian only, AppImage failed)"
      echo -e "${YELLOW}Tauri build completed partially (Debian packaged, but AppImage failed). Continuing...${NC}"
    else
      TAURI_BUILD="Failed"
      echo -e "${RED}Tauri bundle build failed. Continuing other formats...${NC}"
    fi
  fi
  cd ../..
else
  echo -e "${YELLOW}cargo-tauri subcommand is not installed. Skipping AppImage/Debian packaging.${NC}"
  echo -e "To install: cargo install tauri-cli --version '^2' --locked"
  TAURI_BUILD="Skipped (tauri-cli missing)"
fi

# Step 3: Build Fedora/RHEL RPM Package
echo -e "\n${YELLOW}Step 3: Building Fedora/RHEL RPM...${NC}"
if command -v rpmbuild &> /dev/null; then
  mkdir -p rpmbuild/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
  TEMP_DIR="rpmbuild/sim-broadband-manager-${VERSION}"
  mkdir -p "$TEMP_DIR"
  # Copy source files, handling different icon paths
  cp -r sim src "$TEMP_DIR/"
  cp -r sim/src-tauri/icons "$TEMP_DIR/"
  cp Cargo.toml Cargo.lock LICENSE README.md sim-broadband-manager.desktop sim-broadband-manager.spec "$TEMP_DIR/"
  
  cd rpmbuild
  tar -czf SOURCES/sim-broadband-manager-${VERSION}.tar.gz sim-broadband-manager-${VERSION}
  rm -rf sim-broadband-manager-${VERSION}
  cd ..

  if rpmbuild --define "_topdir $(pwd)/rpmbuild" --define "ver ${VERSION}" -bb sim-broadband-manager.spec; then
    RPM_BUILD="Success"
    echo -e "${GREEN}RPM package built successfully!${NC}"
  else
    RPM_BUILD="Failed"
    echo -e "${RED}RPM build failed. Continuing...${NC}"
  fi
else
  echo -e "${YELLOW}rpmbuild not installed. Skipping RPM package build.${NC}"
  RPM_BUILD="Skipped (rpmbuild missing)"
fi

# Step 4: Build Flatpak Package
echo -e "\n${YELLOW}Step 4: Building Flatpak...${NC}"
if command -v flatpak-builder &> /dev/null; then
  if flatpak-builder --force-clean --user --install-deps build-dir com.github.psychopods.sim_broadband_manager.yaml; then
    FLATPAK_BUILD="Success"
    echo -e "${GREEN}Flatpak built successfully!${NC}"
  else
    FLATPAK_BUILD="Failed"
    echo -e "${RED}Flatpak build failed. Continuing...${NC}"
  fi
else
  echo -e "${YELLOW}flatpak-builder not installed. Skipping Flatpak build.${NC}"
  FLATPAK_BUILD="Skipped (flatpak-builder missing)"
fi

# Step 5: Build Snap Package
echo -e "\n${YELLOW}Step 5: Building Snap...${NC}"
if command -v snapcraft &> /dev/null; then
  if snapcraft; then
    SNAP_BUILD="Success"
    echo -e "${GREEN}Snap package built successfully!${NC}"
  else
    SNAP_BUILD="Failed"
    echo -e "${RED}Snap build failed.${NC}"
  fi
else
  echo -e "${YELLOW}snapcraft not installed. Skipping Snap build.${NC}"
  SNAP_BUILD="Skipped (snapcraft missing)"
fi

# Print final build summary table
echo -e "\n${BLUE}=== BUILD SUMMARY ===${NC}"
echo -e "Rust Core Compilation : ${GREEN}${RUST_BUILD}${NC}"

if [ "$TAURI_BUILD" = "Success" ]; then
  echo -e "Tauri (.deb / .AppImage): ${GREEN}${TAURI_BUILD}${NC}"
elif [ "$TAURI_BUILD" = "Partial (Debian only, AppImage failed)" ]; then
  echo -e "Tauri (.deb / .AppImage): ${YELLOW}${TAURI_BUILD}${NC}"
else
  echo -e "Tauri (.deb / .AppImage): ${RED}${TAURI_BUILD}${NC}"
fi

if [ "$RPM_BUILD" = "Success" ]; then
  echo -e "Fedora/RHEL RPM        : ${GREEN}${RPM_BUILD}${NC}"
elif [ "$RPM_BUILD" = "Failed" ]; then
  echo -e "Fedora/RHEL RPM        : ${RED}${RPM_BUILD}${NC}"
else
  echo -e "Fedora/RHEL RPM        : ${YELLOW}${RPM_BUILD}${NC}"
fi

if [ "$FLATPAK_BUILD" = "Success" ]; then
  echo -e "Flatpak Bundle         : ${GREEN}${FLATPAK_BUILD}${NC}"
elif [ "$FLATPAK_BUILD" = "Failed" ]; then
  echo -e "Flatpak Bundle         : ${RED}${FLATPAK_BUILD}${NC}"
else
  echo -e "Flatpak Bundle         : ${YELLOW}${FLATPAK_BUILD}${NC}"
fi

if [ "$SNAP_BUILD" = "Success" ]; then
  echo -e "Snap Package           : ${GREEN}${SNAP_BUILD}${NC}"
elif [ "$SNAP_BUILD" = "Failed" ]; then
  echo -e "Snap Package           : ${RED}${SNAP_BUILD}${NC}"
else
  echo -e "Snap Package           : ${YELLOW}${SNAP_BUILD}${NC}"
fi
echo -e "${BLUE}=====================${NC}"
