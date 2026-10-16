// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "MetaDataRemover",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "MetaDataRemover",
            path: "Sources/MetaDataRemover",
            resources: [.copy("Fonts")]
        )
    ]
)
