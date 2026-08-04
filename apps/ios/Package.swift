// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "AITaverns",
    defaultLocalization: "en",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .executable(name: "AITaverns", targets: ["AITaverns"])
    ],
    targets: [
        .executableTarget(
            name: "AITaverns",
            path: "Sources/AITaverns"
        )
    ]
)
