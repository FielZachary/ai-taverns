import Foundation

enum SampleData {
    static let campaigns: [CampaignSummary] = [
        CampaignSummary(
            id: "00000000-0000-4000-8000-000000000001",
            sessionId: "sample-session",
            mode: .singlePlayer,
            title: "Ashes Under Graywake",
            ownerClientId: nil,
            portraitAssetId: nil,
            portraitUrl: nil,
            preview: "DM: The harbor bells answer from the fog.",
            time: "Today",
            messageCount: 18,
            joinCode: nil
        ),
        CampaignSummary(
            id: "00000000-0000-4000-8000-000000000002",
            sessionId: "sample-table",
            mode: .multiplayer,
            title: "The Salt Concordat",
            ownerClientId: nil,
            portraitAssetId: nil,
            portraitUrl: nil,
            preview: "Waiting on Marra and Ilyon",
            time: "Yesterday",
            messageCount: 42,
            joinCode: "TAVERN"
        )
    ]

    static let room = RoomSnapshot(
        roomId: campaigns[0].id,
        mode: .singlePlayer,
        sessionId: campaigns[0].sessionId,
        players: [
            RoomPlayer(
                id: "player-1",
                actorKey: "actor:garrick",
                slot: 0,
                username: "Zach",
                characterName: "Garrick Vale",
                characterSheet: """
                # Garrick Vale
                Human Fighter, level 3
                HP 27, AC 16, Initiative +2, Speed 30
                STR 16 DEX 14 CON 14 INT 10 WIS 12 CHA 8
                Attacks: Longsword +5 to hit, 1d8+3 slashing. Longbow +4 to hit, 1d8+2 piercing.
                Equipment: chain mail, longsword, longbow, explorer's pack, 34 gp.
                Backstory: Garrick once guarded a lighthouse that should not have gone dark.
                """,
                combatCheatSheet: """
                ## Cheat Sheet

                **Longsword +5** is your steady melee option. Deal **1d8+3 slashing**, or use two hands for **1d10+3**.

                **Second Wind** keeps you standing. Use a bonus action to regain **1d10+3 HP** once per short rest.

                **Action Surge** lets you take one extra action when the moment matters.

                **Armor Class 16** means you can hold a doorway while softer allies move.
                """,
                combatCheatSheetUpdatedAt: Date(),
                combatCheatSheetSourceHash: "sample",
                portraitAssetId: nil,
                portraitUrl: nil,
                portraitStatus: nil,
                status: .waiting,
                lastSeenAt: Date()
            )
        ],
        messages: [
            RoomMessage(
                id: "m1",
                role: .system,
                kind: .system,
                playerName: nil,
                characterName: nil,
                setting: nil,
                content: "Chapter I: The Inn Beneath the Storm",
                createdAt: Date().addingTimeInterval(-900)
            ),
            RoomMessage(
                id: "m2",
                role: .dm,
                kind: .normal,
                playerName: nil,
                characterName: nil,
                setting: RoomMessageSetting(displayLocation: "Graywake Harbor", worldName: "Eldermere", regionName: "The Salt Concordat", settlementName: "Graywake", sceneLocation: "The Lanterned Eel", startingLocation: nil),
                content: "Rain needles the tavern windows. The innkeep slides a sealed copper tube across the bar and says the lighthouse bell rang three times after midnight, though the tower has been empty for nine years.",
                createdAt: Date().addingTimeInterval(-820)
            ),
            RoomMessage(
                id: "m3",
                role: .player,
                kind: .normal,
                playerName: "Zach",
                characterName: "Garrick Vale",
                setting: nil,
                content: "I check the tube for traps before opening it.",
                createdAt: Date().addingTimeInterval(-700)
            ),
            RoomMessage(
                id: "m4",
                role: .dm,
                kind: .askDMAnswer,
                playerName: nil,
                characterName: nil,
                setting: RoomMessageSetting(displayLocation: "Graywake Harbor", worldName: "Eldermere", regionName: "The Salt Concordat", settlementName: nil, sceneLocation: nil, startingLocation: nil),
                content: "Aside: this is a careful investigation, so the DM may ask for a Dexterity or Intelligence check if you keep handling it directly.",
                createdAt: Date().addingTimeInterval(-600)
            )
        ],
        isResolving: false,
        hasBegun: true,
        pendingRollRequest: nil,
        pendingRollRequests: [],
        nextInputNeeded: .playerActions,
        inputTargets: [],
        inputPolicy: .allPlayers,
        combat: CombatSnapshot(active: false, round: 0, turnOwner: nil, turnOwnerPlayerId: nil, turnOwnerCharacterName: nil, initiativeOrder: []),
        updatedAt: Date()
    )
}
