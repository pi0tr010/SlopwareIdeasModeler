# Release build of the Linux desktop packages (x86_64): AppImage, deb, rpm.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl ca-certificates pkg-config file patchelf rpm \
    libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"
ENV APPIMAGE_EXTRACT_AND_RUN=1

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN node scripts/build-mcp-binary.mjs src-tauri/binaries/slopware-mcp-x86_64-unknown-linux-gnu
RUN npx tauri build --bundles appimage,deb,rpm

FROM ubuntu:22.04
COPY --from=0 /src/src-tauri/target/release/bundle/appimage/*.AppImage /out/
COPY --from=0 /src/src-tauri/target/release/bundle/deb/*.deb /out/
COPY --from=0 /src/src-tauri/target/release/bundle/rpm/*.rpm /out/
