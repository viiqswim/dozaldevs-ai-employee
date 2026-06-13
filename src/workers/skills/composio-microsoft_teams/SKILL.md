---
name: composio-microsoft-teams
description: 'Use when working with Microsoft_teams via the Composio integration — reading, writing, or managing Microsoft_teams content. Requires Microsoft_teams to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Microsoft_teams

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| MICROSOFT_TEAMS_ADD_CHAT_MEMBER | Tool to add a conversationMember to a Microsoft Teams chat. Use when adding a user to an existing chat conversation. |
| MICROSOFT_TEAMS_ADD_MEMBER_TO_CHANNEL | Tool to add a member to a Microsoft Teams channel. Use this action when you need to grant a user access to a specific channel within a team, or when you need to add an owner to manage the channel. |
| MICROSOFT_TEAMS_ADD_MEMBER_TO_TEAM | (DEPRECATED: use `MICROSOFT_TEAMS_ADD_TEAM_MEMBER`) Tool to add a user to a Microsoft Teams team. Use when granting or updating membership for a user. |
| MICROSOFT_TEAMS_ADD_TAB | Tool to add a new tab to a Microsoft Teams channel. Use when you need to pin an app or website as a tab in a channel. |
| MICROSOFT_TEAMS_ADD_TEAM_MEMBER | Tool to add a user to a Microsoft Teams team. Use when granting or updating membership for a user. |
| MICROSOFT_TEAMS_ADD_TEAM_MEMBERS_BULK | Tool to add multiple members to a Microsoft Teams team in a single operation. Use when adding several users at once to improve efficiency. |
| MICROSOFT_TEAMS_ARCHIVE_CHANNEL | Tool to archive a channel in a Microsoft Teams team. Use when you need to archive a specific channel within a team. |
| MICROSOFT_TEAMS_ARCHIVE_GROUP_TEAM_CHANNEL | Tool to archive a channel in a Microsoft Teams team using the group ID. Use when you need to archive a specific channel within a team. |
| MICROSOFT_TEAMS_ARCHIVE_TEAM | Tool to archive a Microsoft Teams team. Use after confirming the team ID; returns 202 if accepted. |
| MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS | Retrieves all Microsoft Teams chats a specified user is part of, supporting filtering, property selection, and pagination. |
| MICROSOFT_TEAMS_CHATS_GET_ALL_MESSAGES | DEPRECATED: Use ListUserChatMessages instead. Retrieves all messages from a specified Microsoft Teams chat using the Microsoft Graph API, automatically handling pagination; ensure `chat_id` is valid and OData expressions in `filter` or `select` are correct. |
| MICROSOFT_TEAMS_CLEAR_AUTOMATIC_LOCATION | Tool to clear the automatic location from a user's presence in Microsoft Teams. Use when you need to remove automatically-set location information from presence status. |
| MICROSOFT_TEAMS_CLEAR_ME_PRESENCE_USER_PREFERRED | Tool to clear a user's preferred presence setting in Microsoft Teams. Use when you need to remove the user's manually set presence status and allow the system to automatically determine their presence based on activity. Supports both delegated (user) and application (S2S) authentication. |
| MICROSOFT_TEAMS_CLEAR_MY_PRESENCE | DEPRECATED: Use MICROSOFT_TEAMS_CLEAR_PRESENCE instead. Tool to clear the authenticated user's presence session in Microsoft Teams. Use when you need to remove presence information set by an application for the current user. |
| MICROSOFT_TEAMS_CLEAR_PRESENCE | Tool to clear the presence information for a user's application presence session in Microsoft Teams. Use when you need to remove presence information set by an application for the authenticated user. Note: This action can only clear presence for the authenticated user, not for other users. |
| MICROSOFT_TEAMS_CLEAR_PRESENCE_AUTOMATIC_LOCATION | DEPRECATED: Use MICROSOFT_TEAMS_CLEAR_AUTOMATIC_LOCATION instead. Tool to clear the automatic presence location for the authenticated user. Use when you need to remove automatically-detected location information from the user's presence status. |
| MICROSOFT_TEAMS_CLEAR_PRESENCE_LOCATION | Tool to clear the authenticated user's presence location. Use when you need to remove location information from the user's current presence status. |
| MICROSOFT_TEAMS_CLONE_TEAM | Tool to clone a Microsoft Teams team using the team ID. Use when you need to create a copy of an existing team including its structure, channels, and tabs. This is an asynchronous operation; poll the returned location URL to monitor progress. |
| MICROSOFT_TEAMS_CREATE_CALL_OPERATION | Tool to create a new operation for a communications call. Use when you need to initiate a new operation on an active call. |
| MICROSOFT_TEAMS_CREATE_CHANNEL | Tool to create a new standard, private, or shared channel within a Microsoft Teams team. Use when you need to create a new channel for team collaboration. |
| MICROSOFT_TEAMS_CREATE_CONTENT_SHARING_SESSION | Tool to create a content sharing session in a Microsoft Teams call. Use when you need to initiate content sharing during an active call. |
| MICROSOFT_TEAMS_CREATE_GROUP_TEAM_CHANNEL | Tool to create a new channel in a group's associated team. Use when you have a group ID and need to create a channel in its team. |
| MICROSOFT_TEAMS_CREATE_MEETING | Use to schedule a new standalone Microsoft Teams online meeting, i.e., one not linked to any calendar event. |
| MICROSOFT_TEAMS_CREATE_OFFER_SHIFT_REQUEST | Tool to create a new offer shift request in a user's joined team schedule. Use when a team member wants to offer their shift to another team member. |
| MICROSOFT_TEAMS_CREATE_OPEN_SHIFT | Tool to create a new open shift in a Microsoft Teams team schedule. Use when you need to publish available shifts that team members can claim. |
| MICROSOFT_TEAMS_CREATE_OPEN_SHIFT_CHANGE_REQUEST | Tool to create a new open shift change request in a team schedule. Use when a team member wants to claim an available open shift. |
| MICROSOFT_TEAMS_CREATE_OR_GET_ONLINE_MEETING | Tool to create a new Microsoft Teams online meeting or retrieve an existing one based on externalId. Use when you need an idempotent meeting creation operation that returns an existing meeting if the externalId matches. |
| MICROSOFT_TEAMS_CREATE_OR_UPDATE_SCHEDULE | Tool to create or replace a schedule object for a Microsoft Teams team. Use when you need to enable or configure scheduling features for a team. |
| MICROSOFT_TEAMS_CREATE_SCHEDULE_DAY_NOTE | Tool to create a new day note in a team's schedule. Use when you need to add notes or reminders for a specific date in the team schedule. Day notes help communicate important information to team members for a particular day. |
| MICROSOFT_TEAMS_CREATE_SCHEDULING_GROUP | Tool to create a new scheduling group in a team's schedule. Use when you need to organize team members into groups for shift scheduling and management. This action uses 'team_id' parameter naming which aligns with the Microsoft Graph API endpoint (/teams/{id}/schedule/schedulingGroups). |
| MICROSOFT_TEAMS_CREATE_SHIFT | Tool to create a new shift in a Microsoft Teams team schedule. Use when you need to assign work shifts to team members with specific start/end times and details. |
| MICROSOFT_TEAMS_CREATE_TEAM | Tool to create a new Microsoft Teams team. Use when you need to provision a team with optional template, channels, and members. |
| MICROSOFT_TEAMS_CREATE_TEAM_FROM_GROUP | Tool to create a new team under an existing Microsoft 365 group. Use when you need to add Teams capabilities to an existing group. |
| MICROSOFT_TEAMS_CREATE_TIME_OFF | Tool to create a new timeOff instance in a team's schedule. Use when you need to create approved time off for a team member (vacation, sick leave, etc.). |
| MICROSOFT_TEAMS_CREATE_TIME_OFF_REASON | Tool to create a new time off reason in a team's schedule. Use when you need to define a new category for time off requests with a custom name and icon. |
| MICROSOFT_TEAMS_CREATE_TIME_OFF_REQUEST | Tool to create a new time off request in a team's schedule. Use when a team member needs to request time off for vacation, sick leave, or other absences. |
| MICROSOFT_TEAMS_CREATE_USER_ONLINE_MEETING | Tool to create a new Microsoft Teams online meeting for a specific user. Use when you need to create an online meeting on behalf of a user. |
| MICROSOFT_TEAMS_DELETE_CALL_OPERATION | Tool to delete a navigation property operation for a communications call. Use when you need to remove a specific commsOperation from a call. |
| MICROSOFT_TEAMS_DELETE_CHANNEL | Tool to delete a channel from a Microsoft Teams team. Use when you need to permanently remove a channel. Note that the General channel cannot be deleted. |
| MICROSOFT_TEAMS_DELETE_DAY_NOTE | Tool to delete a day note from a Microsoft Teams schedule. Use when you need to remove a day note from a specific date in the team schedule. The If-Match header with ETag value is required for deletion. |
| MICROSOFT_TEAMS_DELETE_OPEN_SHIFT | Tool to delete an open shift from a Microsoft Teams schedule. Use when you need to remove an unfilled shift from the team schedule. |
| MICROSOFT_TEAMS_DELETE_SCHEDULING_GROUP | Tool to delete a scheduling group from a Microsoft Teams team schedule. Use this when you need to remove a scheduling group from a specific team. |
| MICROSOFT_TEAMS_DELETE_SHIFT | Tool to delete a shift from a Microsoft Teams team schedule. Use when you need to permanently remove a scheduled shift. |
| MICROSOFT_TEAMS_DELETE_SOFT_MESSAGE | Tool to soft-delete a message in a Teams channel. Use when you need to remove a message without permanently deleting it. |
| MICROSOFT_TEAMS_DELETE_TAB | Tool to delete a tab from a Microsoft Teams channel. Use when you need to permanently remove a tab from a channel. |
| MICROSOFT_TEAMS_DELETE_TEAM | Tool to delete a Microsoft Teams team. Use after confirming the target team ID. |
| MICROSOFT_TEAMS_DELETE_TIME_OFF | Tool to delete a timeOff from a team's schedule. Use when you need to remove a scheduled time off entry from a team member's schedule. |
| MICROSOFT_TEAMS_DELETE_TIME_OFF_REASON | Tool to delete a time off reason from a team's schedule. Use when you need to remove a time off reason. Note: This operation marks the time off reason as inactive rather than permanently deleting it. |
| MICROSOFT_TEAMS_DELETE_TIME_OFF_REQUEST | Tool to delete a time off request from a Microsoft Teams team schedule. Use when you need to permanently remove a time off request. |
| MICROSOFT_TEAMS_DELETE_USER_ONLINE_MEETING | Tool to delete an online meeting for a user. Use when you need to permanently remove an online meeting from a user's calendar. |
| MICROSOFT_TEAMS_GET_CALL_OPERATION | Tool to get a specific commsOperation for a call. Use to check the status of long-running call operations. |
| MICROSOFT_TEAMS_GET_CHANNEL | Tool to get a specific channel in a team. Use after obtaining valid team and channel IDs to fetch channel details. |
| MICROSOFT_TEAMS_GET_CHANNEL_MESSAGE | Retrieves a specific message from a Microsoft Teams channel using its Team, Channel, and Message IDs. |
| MICROSOFT_TEAMS_GET_CHANNEL_MESSAGE_REPLY | Tool to retrieve a single reply to a message in a channel. Use when you need to get details of a specific reply message. |
| MICROSOFT_TEAMS_GET_CHAT | Tool to retrieve a single chat by ID. Use when you need to get details about a specific chat. |
| MICROSOFT_TEAMS_GET_CHAT_LAST_MESSAGE_PREVIEW | DEPRECATED: Use MICROSOFT_TEAMS_GET_CHAT instead. Tool to get lastMessagePreview from a chat. Use when you need to see the preview of the most recent message in a specific chat. |
| MICROSOFT_TEAMS_GET_CHAT_MEMBER | Tool to get a specific conversation member from a Microsoft Teams chat. Use when you need details about a specific chat participant. |
| MICROSOFT_TEAMS_GET_CHAT_MESSAGE | Tool to get a specific chat message. Use after confirming chat_id and message_id. |
| MICROSOFT_TEAMS_GET_DAY_NOTE | Tool to retrieve a specific day note from a team's schedule. Use when you need to view notes for a specific date in a team's schedule. |
| MICROSOFT_TEAMS_GET_FILES_FOLDER | Tool to get the files folder (DriveItem) metadata for a specific channel in a Microsoft Teams team. Use when you need to access file storage information for a channel. |
| MICROSOFT_TEAMS_GET_GROUP_TEAM_CHANNEL | DEPRECATED: Use MICROSOFT_TEAMS_GET_CHANNEL instead. Tool to get a specific channel from a group's team. Use when you have a group ID and channel ID to fetch channel details. |
| MICROSOFT_TEAMS_GET_MEETING_TRANSCRIPT_CONTENT | Retrieve the raw text/vtt content for a Microsoft Teams meeting transcript. Use this after listing meeting transcripts and selecting a transcript ID. The Microsoft Graph transcript APIs only support calendar-backed online meetings that have an available transcript; standalone meetings created only with the create onlineMeeting API can return 412. |
| MICROSOFT_TEAMS_GET_MY_PROFILE | Tool to retrieve a user's profile (id/UPN/mail/displayName). Supports both delegated auth (use user_id='me') and application-only auth (specify user ID/UPN). Use when operations require user identity information (e.g., chat creation). |
| MICROSOFT_TEAMS_GET_OFFER_SHIFT_REQUEST | Tool to get a specific offer shift request from a Microsoft Teams schedule. Use when you need to retrieve details of a single offer shift request by its ID. |
| MICROSOFT_TEAMS_GET_ONLINE_MEETING | Tool to retrieve details of a specific Microsoft Teams online meeting by its ID. Use when you need to get the properties and relationships of an existing meeting. |
| MICROSOFT_TEAMS_GET_OPEN_SHIFT | Tool to get a specific open shift from a Microsoft Teams schedule. Use when you need to retrieve details about a particular unassigned open shift by its ID. |
| MICROSOFT_TEAMS_GET_OPEN_SHIFT_CHANGE_REQUEST | Tool to retrieve a specific open shift change request from a Microsoft Teams team's schedule. Use when you need to get details about a particular open shift request including its state, sender, and manager actions. |
| MICROSOFT_TEAMS_GET_PRESENCE | Tool to get a specific user's presence information. Use when checking availability status, activity, or work location for a particular user. |
| MICROSOFT_TEAMS_GET_PRIMARY_CHANNEL | Tool to get the default (General) channel of a team. Use when you need to access the primary channel without knowing its channel ID. |
| MICROSOFT_TEAMS_GET_SCHEDULE | Tool to retrieve the properties and relationships of a schedule object. Use when you need to get schedule configuration details for a team. |
| MICROSOFT_TEAMS_GET_SCHEDULING_GROUP | Tool to retrieve a specific scheduling group from a Microsoft Teams team's schedule. Use when you need to get details about a scheduling group including its members, status, and metadata. |
| MICROSOFT_TEAMS_GET_SHIFT | Tool to retrieve a shift by ID from a Microsoft Teams team schedule. Use when you need to get details of a specific shift assignment. |
| MICROSOFT_TEAMS_GET_SWAP_SHIFTS_CHANGE_REQUEST | Tool to get a specific swap shift change request from a Microsoft Teams schedule. Use when you need to retrieve details of a single swap shift change request by its ID. |
| MICROSOFT_TEAMS_GET_TAB | Tool to get a specific tab in a Microsoft Teams channel. Use when you need to retrieve details of a particular tab. |
| MICROSOFT_TEAMS_GET_TEAM_FROM_GROUP | Tool to get a specific team. Use when full details of one team by ID are needed. |
| MICROSOFT_TEAMS_GET_TEAM_MEMBER | Tool to get a specific conversation member from a team. Use when retrieving details about a team member by their membership ID. |
| MICROSOFT_TEAMS_GET_TEAM_OPERATION | Tool to retrieve the status of a Teams async operation using teamId and operationId. Use when you need to poll and track the progress of long-running operations like team creation or archiving. Microsoft recommends waiting at least 30 seconds between polling requests. |
| MICROSOFT_TEAMS_GET_TEAMS_APP_DEFINITION | Tool to get an installed app in a Microsoft Teams team. Use when you need to retrieve details of a specific app installation. |
| MICROSOFT_TEAMS_GET_TEAM_TEMPLATE | DEPRECATED: Use MICROSOFT_TEAMS_GET_TEAM_FROM_GROUP with expand="template" instead. Tool to get the template used to create a team. Use when you need to retrieve the template information for a specific team. |
| MICROSOFT_TEAMS_GET_TIME_OFF | Tool to retrieve a specific time off entry from a Microsoft Teams team's schedule by ID. Use when you need to get details about a particular time off period including its dates, reason, and status. |
| MICROSOFT_TEAMS_GET_TIME_OFF_REASON | Tool to get a specific time off reason from a team's schedule. Use when you need to retrieve details about a time off reason including its display name, icon type, and active status. |
| MICROSOFT_TEAMS_GET_TIME_OFF_REQUEST | Tool to retrieve a specific time off request from a team's schedule. Use when you need to check the status or details of a time off request. |
| MICROSOFT_TEAMS_GET_USER_CHAT | Tool to retrieve a specific chat for a user. Use when you need to get details about a chat that a specific user is part of. |
| MICROSOFT_TEAMS_GET_USER_TEAMWORK | Tool to get userTeamwork settings for a specified user, including Microsoft Teams region and locale. Use when you need to determine user's Teams configuration or regional settings. |
| MICROSOFT_TEAMS_HIDE_CHAT_FOR_USER | Tool to hide a Microsoft Teams chat for a specific user. Use when you need to hide a chat from a user's chat list. Note: The chat is automatically unhidden if an action such as sending a message is taken at the chat level. |
| MICROSOFT_TEAMS_LIST_ASSOCIATED_TEAMS | Tool to list teams that a user is associated with in Microsoft Teams. Use when you need to get teams where a user is either a direct member or a member of a shared channel hosted in the team. |
| MICROSOFT_TEAMS_LIST_CHANNEL_TABS | Tool to list tabs from a Microsoft Teams channel. Use when you need to retrieve all tabs configured in a specific channel. Note: The Files tab (native to channels) is not returned by this API. |
| MICROSOFT_TEAMS_LIST_CHAT | DEPRECATED: Use MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS instead. Tool to list chats that the user is part of. Use when retrieving the list of chats for a user. |
| MICROSOFT_TEAMS_LIST_CHAT_MEMBERS | DEPRECATED: Use MICROSOFT_TEAMS_USERS_CHATS_LIST_MEMBERS instead. Tool to list members of a Microsoft Teams chat. Use when you need to retrieve the members of a specific one-on-one chat, group chat, or meeting chat. |
| MICROSOFT_TEAMS_LIST_COMMUNICATIONS_CALLS_OPERATIONS | Tool to list operations on a Microsoft Teams call. Use when you need to retrieve the status of long-running operations like adding large gallery views, recording, or playing prompts on an active call. |
| MICROSOFT_TEAMS_LIST_DELETED_TEAMS | Tool to list deleted Microsoft Teams and their properties. Use when you need to retrieve a list of teams that have been deleted. |
| MICROSOFT_TEAMS_LIST_GROUP_TEAM_CHANNELS | DEPRECATED: Use MICROSOFT_TEAMS_LIST_CHANNELS instead. Tool to list channels from a group's associated team. Use when you have a group ID and need to retrieve its team's channels. |
| MICROSOFT_TEAMS_LIST_GROUP_TEAM_OPERATIONS | Tool to list operations on a group's team. Use when you need to retrieve all async operations (such as team creation, archiving, channel creation) for a specific group's team. |
| MICROSOFT_TEAMS_LIST_INCOMING_CHANNELS | Tool to list incoming channels shared with a Microsoft Teams team. Use when you need to view channels from other teams that have been shared with this team. |
| MICROSOFT_TEAMS_LIST_INSTALLED_APPS | Tool to list apps installed in a Microsoft Teams team. Use when you need to retrieve the collection of apps installed in a specific team. |
| MICROSOFT_TEAMS_LIST_MEETING_TRANSCRIPTS | List meeting transcripts for a Microsoft Teams online meeting. Retrieves all transcripts associated with a specific meeting, including metadata such as creation time, meeting organizer, and content URL. Use this action when you need to access or review the transcription records of a meeting, for example to extract meeting notes, analyze discussion topics, or maintain compliance records. |
| MICROSOFT_TEAMS_LIST_MESSAGE_REPLIES | Tool to list all replies to a specific message in a Microsoft Teams channel. Use when you need to retrieve the conversation thread for a particular message. |
| MICROSOFT_TEAMS_LIST_OFFER_SHIFT_REQUESTS | Tool to list offer shift requests in a Microsoft Teams schedule. Use when you need to retrieve all offer shift requests for a team's schedule. |
| MICROSOFT_TEAMS_LIST_ONLINE_MEETINGS | Look up a Microsoft Teams online meeting for a user by identifier. This is effectively a 'lookup-by-identifier' endpoint, NOT a general-purpose list or search. Microsoft Graph REQUIRES an OData $filter predicate on /me/onlineMeetings and /users/{user_id}/onlineMeetings; without it the API returns HTTP 400 'Filter expression expected'. The only supported filter properties on this endpoint are JoinWebUrl and joinMeetingIdSettings/joinMeetingId (e.g. "JoinWebUrl eq 'https://teams.microsoft.com/l/meetup-join/...'" or "joinMeetingIdSettings/joinMeetingId eq '1234567890'"). subject and VideoTeleconferenceId are NOT supported here. If you already know the meeting id, prefer MICROSOFT_TEAMS_USERS_GET_ONLINE_MEETING. There is no Graph API for free-text searching a user's meetings by title. |
| MICROSOFT_TEAMS_LIST_OPEN_SHIFT_CHANGE_REQUESTS | Tool to list open shift change requests in a Microsoft Teams schedule. Use when you need to retrieve all open shift requests for a team's schedule. |
| MICROSOFT_TEAMS_LIST_OPEN_SHIFTS | Tool to list open shifts in a Microsoft Teams schedule. Use when you need to retrieve all unassigned open shifts for a team's schedule. |
| MICROSOFT_TEAMS_LIST_PEOPLE | Retrieves a list of people relevant to a specified user from Microsoft Graph, noting the `search` parameter is only effective if `user_id` is 'me'. |
| MICROSOFT_TEAMS_LIST_PINNED_MESSAGES | Tool to retrieve the list of pinned messages in a Microsoft Teams chat. Use when you need to get all messages that have been pinned in a specific chat conversation. |
| MICROSOFT_TEAMS_LIST_SCHEDULE_DAY_NOTES | Tool to list all dayNotes from a team's schedule. Use when you need to retrieve all day notes or search/filter notes for specific dates in a team's schedule. |
| MICROSOFT_TEAMS_LIST_SCHEDULING_GROUPS | Tool to list scheduling groups in a team's schedule. Use when you need to retrieve all scheduling groups for shift management and organization. |
| MICROSOFT_TEAMS_LIST_SHIFTS | Tool to list shifts in a Microsoft Teams schedule. Use when you need to retrieve all shifts for a team's schedule. |
| MICROSOFT_TEAMS_LIST_SWAP_SHIFTS_CHANGE_REQUESTS | Tool to list swap shift change requests in a Microsoft Teams schedule. Use when you need to retrieve all swap shift requests for a team's schedule. |
| MICROSOFT_TEAMS_LIST_TEAM_MEMBERS | Tool to list members of a Microsoft Teams team. Use when you need to retrieve the members of a specific team, for auditing or notifications. |
| MICROSOFT_TEAMS_LIST_TEAM_OPERATIONS | Tool to list operations from a team. Use when you need to retrieve all async operations (such as team creation, archiving, channel creation) for a specific team. |
| MICROSOFT_TEAMS_LIST_TEAM_PERMISSION_GRANTS | Tool to list all resource-specific permission grants for a team with support for filtering, pagination, and sorting. Use when you need to identify which Microsoft Entra apps have access to a team and their corresponding permissions. |
| MICROSOFT_TEAMS_LIST_TEAM_TEMPLATES | Tool to list available Microsoft Teams templates. Use when retrieving templates for team creation or customization workflows. |
| MICROSOFT_TEAMS_LIST_TIME_OFF | Tool to list time off entries from a Microsoft Teams team's schedule. Use when you need to retrieve all time off periods for a team. |
| MICROSOFT_TEAMS_LIST_TIME_OFF_REASONS | Tool to get time off reasons from a team's schedule. Use when you need to retrieve the list of available time off reasons for scheduling in Microsoft Teams. |
| MICROSOFT_TEAMS_LIST_TIME_OFF_REQUESTS | Tool to retrieve a list of time off requests from a Microsoft Teams team's schedule. Use when you need to view all time off requests including their status (pending, approved, declined), dates, and associated users. |
| MICROSOFT_TEAMS_LIST_USER_CHAT_MEMBERS | Tool to list members of a specific chat for a user in Microsoft Teams. Use when you need to retrieve the members of a specific user's chat, whether it's a one-on-one chat, group chat, or meeting chat. |
| MICROSOFT_TEAMS_LIST_USER_CHAT_MESSAGES | Tool to retrieve messages from a specific chat for a given user. Use when you need to access chat messages through the user context. |
| MICROSOFT_TEAMS_LIST_USER_JOINED_TEAMS | Tool to list the Teams that a specified user is a direct member of (joined teams). Use for access/membership audits when enumerating team members is access-restricted. |
| MICROSOFT_TEAMS_LIST_USERS | Tool to list all users in the organization. Use when you need to retrieve directory users with filtering, pagination, and field selection. |
| MICROSOFT_TEAMS_MARK_CHAT_READ_FOR_USER | Tool to mark a chat as read for a specific user in Microsoft Teams. Use when you need to update the read status of a chat for a particular user. |
| MICROSOFT_TEAMS_MARK_CHAT_UNREAD_FOR_USER | Marks a specific chat as unread for a user by setting the last read message timestamp. Use when you need to mark messages after a certain time as unread. |
| MICROSOFT_TEAMS_PIN_MESSAGE | Tool to pin a message in a Microsoft Teams chat. Use when you need to highlight an important message for quick access. |
| MICROSOFT_TEAMS_POST_MESSAGE_REPLY | Sends a reply to an existing message, identified by `message_id`, within a specific `channel_id` of a given `team_id` in Microsoft Teams. |
| MICROSOFT_TEAMS_PROVISION_CHANNEL_EMAIL | Tool to provision an email address for a Microsoft Teams channel. Use when you need to enable email integration for a specific channel. |
| MICROSOFT_TEAMS_REMOVE_CHANNEL_EMAIL | Tool to remove the email address of a channel in Microsoft Teams. Use when you need to disable email integration for a specific channel. |
| MICROSOFT_TEAMS_REMOVE_CHAT_MEMBER | Tool to remove a member from a Microsoft Teams chat. Use when you need to remove a user from a chat conversation. |
| MICROSOFT_TEAMS_REMOVE_TEAM_MEMBER | Tool to remove a member from a Microsoft Teams team. Use when you need to remove a user from a team. |
| MICROSOFT_TEAMS_REMOVE_TEAM_MEMBERS | Tool to remove multiple members from a Microsoft Teams team in bulk. Use when you need to remove one or more users from a team. |
| MICROSOFT_TEAMS_SEARCH_FILES | Search files in Microsoft Teams using KQL syntax. Find files by name, type, content, author, and modification date across all Teams and channels. Supports boolean logic and date ranges. Examples: 'filetype:pdf AND lastmodifiedtime>=2024-10-01', 'contract AND budget', 'filename:report AND author:user@example.com' |
| MICROSOFT_TEAMS_SEARCH_MESSAGES | Search Microsoft Teams messages using powerful KQL syntax. Supports sender (from:), date filters (sent:), attachments, and boolean logic. Works across all Teams chats and channels the user has access to. Examples: 'from:user@example.com AND sent>=2024-10-01', 'punchlist OR termination', 'sent>today-30 AND hasattachment:yes' NOTE: This action requires an organizational Microsoft 365 account (Azure AD/Entra ID). It does NOT work with personal Microsoft accounts (MSA) such as @outlook.com, @hotmail.com, or @live.com. If using a personal Microsoft account, this search will fail. |
| MICROSOFT_TEAMS_SEND_ACTIVITY_NOTIFICATION | Tool to send activity notifications to specified recipients in Microsoft Teams. Use when you need to send custom notifications to users, team members, or channel members. |
| MICROSOFT_TEAMS_SET_ME_PREFERRED_PRESENCE | DEPRECATED: Use MICROSOFT_TEAMS_SET_USER_PREFERRED_PRESENCE instead. Tool to set the preferred availability and activity status for the current authenticated user. Use when you need to update your own presence status in Microsoft Teams. Preferred presence takes effect only when at least one presence session exists. |
| MICROSOFT_TEAMS_SET_PRESENCE | Tool to set the presence information for a user's application presence session. Use when you need to update a user's presence state in Microsoft Teams. Valid combinations: Available/Available, Busy/InACall, Busy/InAConferenceCall, Away/Away, or DoNotDisturb/Presenting. |
| MICROSOFT_TEAMS_SET_PRESENCE_AUTOMATIC_LOCATION | Tool to set the automatic presence location (office/remote/timeOff) for a specified user. Use when updating work location status in Microsoft Teams via automatic detection. |
| MICROSOFT_TEAMS_SET_PRESENCE_MANUAL_LOCATION | DEPRECATED: Use MICROSOFT_TEAMS_SET_USER_PRESENCE_MANUAL_LOCATION instead. Tool to set the manual presence location (office/remote/timeOff) for the authenticated user. Use when updating work location status in Microsoft Teams. |
| MICROSOFT_TEAMS_SET_USER_PREFERRED_PRESENCE | Tool to set the preferred availability and activity status for a user. Use when you need to update a user's presence status in Microsoft Teams. Preferred presence takes effect only when at least one presence session exists for the user. |
| MICROSOFT_TEAMS_SET_USER_PRESENCE_MANUAL_LOCATION | Tool to set the manual presence location (office/remote/timeOff) for a specific user. Use when updating work location status for a user in Microsoft Teams. |
| MICROSOFT_TEAMS_SHARE_TEAM_SCHEDULE | Tool to share a Microsoft Teams schedule for a specified time range. Use when you need to make a team's schedule visible to members. |
| MICROSOFT_TEAMS_TEAMS_CREATE_CHANNEL | (DEPRECATED: use `MICROSOFT_TEAMS_CREATE_CHANNEL`) Tool to create a new standard, private, or shared channel within a Microsoft Teams team. Use when you need to create a new channel for team collaboration. |
| MICROSOFT_TEAMS_TEAMS_CREATE_CHAT | Creates a new chat; if a 'oneOnOne' chat with the specified members already exists, its details are returned, while 'group' chats are always newly created. IMPORTANT: The authenticated user MUST be included as one of the members. |
| MICROSOFT_TEAMS_TEAMS_LIST | Retrieves Microsoft Teams accessible by the authenticated user, allowing filtering, property selection, and pagination. |
| MICROSOFT_TEAMS_TEAMS_LIST_CHANNEL_MESSAGES | Tool to list messages in a Teams channel when team_id and channel_id are known (no chat_id required). Use this to enumerate channel message history and obtain message_id for follow-on operations like listing replies or getting message details. |
| MICROSOFT_TEAMS_TEAMS_LIST_CHANNELS | Retrieves channels for a specified Microsoft Teams team ID (must be valid and for an existing team), with options to include shared channels, filter results, and select properties. |
| MICROSOFT_TEAMS_TEAMS_LIST_CHAT_MESSAGES | DEPRECATED: Use ListUserChatMessages instead. Retrieves messages (newest first) from an existing and accessible Microsoft Teams one-on-one chat, group chat, or channel thread, specified by `chat_id`. |
| MICROSOFT_TEAMS_TEAMS_POST_CHANNEL_MESSAGE | Posts a new top-level message to a channel in Microsoft Teams (does NOT reply to an existing message). Despite the file name 'reply_to_channel_chat', this action creates a brand-new message in the channel via POST /teams/{id}/channels/{id}/messages. To reply to an existing message thread, use the dedicated reply action instead. |
| MICROSOFT_TEAMS_TEAMS_POST_CHAT_MESSAGE | Sends a non-empty message (text or HTML) to a specified, existing Microsoft Teams chat; content must be valid HTML if `content_type` is 'html'. |
| MICROSOFT_TEAMS_TEAMS_POST_MESSAGE_REPLY | (DEPRECATED: use `MICROSOFT_TEAMS_POST_MESSAGE_REPLY`) Sends a reply to an existing message, identified by `message_id`, within a specific `channel_id` of a given `team_id` in Microsoft Teams. |
| MICROSOFT_TEAMS_UNARCHIVE_CHANNEL | Tool to unarchive a channel in a Microsoft Teams team. Use when you need to restore an archived channel to active state. |
| MICROSOFT_TEAMS_UNARCHIVE_GROUP_TEAM_CHANNEL | Tool to unarchive a channel in a Microsoft Teams group's team. Use when you need to restore an archived channel to active state. |
| MICROSOFT_TEAMS_UNARCHIVE_TEAM | Tool to unarchive a Microsoft Teams team. Use when you need to restore an archived team to active state. |
| MICROSOFT_TEAMS_UNHIDE_CHAT_FOR_USER | Tool to unhide a chat for a specific user. Use when you need to make a hidden chat visible again in the user's chat list. |
| MICROSOFT_TEAMS_UNPIN_MESSAGE | Tool to unpin a message from a Microsoft Teams chat. Use when you need to remove a pinned message. |
| MICROSOFT_TEAMS_UPDATE_CALL | Tool to update the navigation property calls in Microsoft Teams communications. Use when you need to modify properties of an existing call. |
| MICROSOFT_TEAMS_UPDATE_CALL_OPERATION | Tool to update the navigation property operations in communications. Use when you need to modify properties of an existing call operation. |
| MICROSOFT_TEAMS_UPDATE_CALL_PARTICIPANT | Tool to update a participant in a Microsoft Teams call. Use when you need to modify participant properties such as lobby status. |
| MICROSOFT_TEAMS_UPDATE_CHANNEL | Tool to update channel properties in a Microsoft Teams group. Use when you need to modify channel description, display name, or favorite settings. |
| MICROSOFT_TEAMS_UPDATE_CHANNEL_MESSAGE | Tool to update a message in a channel. Use when you need to modify an existing channel message after confirming channel and message IDs. |
| MICROSOFT_TEAMS_UPDATE_CHAT | Tool to update the properties of a chat. Use when you need to modify chat settings such as the topic. |
| MICROSOFT_TEAMS_UPDATE_CHAT_MESSAGE | Tool to update a specific message in a chat. Use when you need to correct or modify a sent chat message. |
| MICROSOFT_TEAMS_UPDATE_CONTENT_SHARING_SESSION | Tool to update a content sharing session in a Microsoft Teams call. Use when you need to modify the properties of an existing content sharing session. |
| MICROSOFT_TEAMS_UPDATE_DAY_NOTE | Tool to update an existing day note in a team's schedule. Use when you need to modify notes or reminders for a specific date in the team schedule. |
| MICROSOFT_TEAMS_UPDATE_ONLINE_MEETING | Tool to update the properties of an existing Microsoft Teams online meeting. Use when you need to modify meeting details such as subject, start time, or end time. |
| MICROSOFT_TEAMS_UPDATE_OPEN_SHIFT | Tool to update an existing open shift in a Microsoft Teams team schedule. Use when you need to modify open shift details such as times, theme, notes, or open slot count. |
| MICROSOFT_TEAMS_UPDATE_SCHEDULING_GROUP | Tool to replace/update a scheduling group in a team's schedule. Use when you need to modify properties of an existing scheduling group such as display name, active status, code, or member list. |
| MICROSOFT_TEAMS_UPDATE_TAB | Tool to update the properties of a tab in a Microsoft Teams channel. Use when you need to modify tab display name, configuration, or web URL. |
| MICROSOFT_TEAMS_UPDATE_TEAM | Tool to update the properties of a team. Use when you need to modify team settings such as member, messaging, or fun settings. |
| MICROSOFT_TEAMS_UPDATE_TEAM_MEMBER | Tool to update a team member's roles or properties in Microsoft Teams. Use when you need to change a member's role (e.g., promote to owner or demote to member). |
| MICROSOFT_TEAMS_UPDATE_TEAM_SCHEDULE_SHIFT | Tool to update an existing shift in a Microsoft Teams team schedule. Use when you need to modify shift details like times, assigned user, or notes. |
| MICROSOFT_TEAMS_UPDATE_TIME_OFF | Tool to replace an existing timeOff entry in a team's schedule. Use when you need to update time off details including dates, reason, or status. |
| MICROSOFT_TEAMS_UPDATE_TIME_OFF_REASON | Tool to update a time off reason in a team's schedule. Use when you need to modify the display name, icon, active status, or code of an existing time off reason. |
