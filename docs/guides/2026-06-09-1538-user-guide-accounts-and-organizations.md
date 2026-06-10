# User Guide: Accounts and Organizations

This guide walks you through everything you need to know about managing your account and your organization on the AI Employee Platform. No technical knowledge required.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Your Profile and Home Screen](#your-profile-and-home-screen)
3. [Switching Between Organizations](#switching-between-organizations)
4. [Understanding Roles](#understanding-roles)
   - [Organization Roles](#organization-roles)
   - [Platform Administrator](#platform-administrator)
5. [Inviting Someone to Your Organization](#inviting-someone-to-your-organization)
6. [Accepting an Invitation](#accepting-an-invitation)
7. [Revoking a Pending Invitation](#revoking-a-pending-invitation)
8. [Changing a Member's Role](#changing-a-members-role)
9. [Removing a Member](#removing-a-member)
10. [Deactivating a User Account](#deactivating-a-user-account)
11. [Tips and Common Questions](#tips-and-common-questions)

---

## Getting Started

### Opening the Dashboard

Open your web browser and go to:

```
http://localhost:7700/dashboard/
```

You'll land on the sign-in page if you're not already signed in.

### Signing In with Email and Password

1. Go to `http://localhost:7700/dashboard/login`
2. Enter your email address in the "Email" field.
3. Enter your password in the "Password" field.
4. Click **Sign In**.

If your credentials are correct, you'll be taken straight to the dashboard home.

### Signing In with Google

1. Go to `http://localhost:7700/dashboard/login`
2. Click **Sign in with Google**.
3. A Google sign-in window will appear. Choose your Google account.
4. You'll be redirected back to the dashboard automatically.

### Resetting a Forgotten Password

1. Go to `http://localhost:7700/dashboard/forgot-password`
2. Enter the email address tied to your account.
3. Click **Send Reset Link**.
4. Check your inbox for an email with a password reset link.
5. Click the link in the email and follow the prompts to set a new password.

If you don't see the email within a few minutes, check your spam or junk folder.

### Creating a New Account

1. Go to `http://localhost:7700/dashboard/signup`
2. Enter your email address.
3. Choose a password. It must be at least 8 characters long.
4. Click **Create Account**.
5. Check your inbox for a confirmation email and click the link inside to verify your address.

Once verified, you can sign in right away.

---

## Your Profile and Home Screen

After signing in, you land on the dashboard home. At the top of the page you'll see the name of the organization you're currently viewing. Everything on the screen, including your AI employees and task history, belongs to that organization.

You can only see organizations you've been invited to. If you haven't been added to any organization yet, the dashboard will be mostly empty until someone sends you an invitation.

---

## Switching Between Organizations

If you belong to more than one organization, a selector appears near the top of the page. It shows the name of the organization you're currently viewing.

To switch:

1. Click the organization name or the selector dropdown.
2. A list of your organizations appears.
3. Click the one you want to switch to.

The page updates immediately to show that organization's data. The selected organization is saved in the URL, so if you refresh the page or share the link, it stays on the same organization. You'll never accidentally see another company's data.

---

## Understanding Roles

The platform has two distinct types of roles: **organization roles** (which control what you can do inside one specific organization) and the **Platform Administrator** role (which is a special system-level account that manages the entire platform).

---

### Organization Roles

Every member of an organization has a role. Your role controls what you can see and do within that organization. There are four roles.

**Owner**
Full control over the organization. Owners can manage members, change settings, access sensitive credentials, and delete the organization. There must always be at least one Owner, so the last Owner cannot be removed or demoted.

**Admin**
Can do almost everything an Owner can, except access sensitive credentials or delete the organization. Admins can invite new members, change roles, manage AI employees, and trigger tasks.

**Member**
Can trigger AI employees and view task results. Cannot change settings, manage people, or access sensitive information.

**Viewer**
Read-only access. Can see tasks and basic organization info but cannot trigger anything or make any changes.

#### What Can Each Role Do?

| Permission                            | Owner | Admin | Member | Viewer |
| ------------------------------------- | ----- | ----- | ------ | ------ |
| Trigger AI employees                  | Yes   | Yes   | Yes    | No     |
| Manage members (change roles, remove) | Yes   | Yes   | No     | No     |
| Invite new people                     | Yes   | Yes   | No     | No     |
| Access sensitive credentials          | Yes   | No    | No     | No     |
| Delete the organization               | Yes   | No    | No     | No     |

---

### Platform Administrator

The Platform Administrator is a separate, system-level account — not an organization role. Think of it as the person who runs the entire platform itself, rather than someone who runs one organization on it.

**Key differences from an Organization Owner:**

- An Organization Owner controls one organization. A Platform Administrator can access and manage every organization on the platform.
- Organization Owners are invited through the normal invitation flow. The Platform Administrator account is set up once during the initial system setup — it cannot be created through the dashboard.
- A Platform Administrator does not need to be a member of any organization to view or manage it. They have automatic access to everything.

**What a Platform Administrator can do that organization roles cannot:**

- View and manage all organizations on the platform, even ones they weren't invited to
- Change platform-wide settings that affect all organizations and AI employees (for example, cost limits or system defaults)
- Manage the list of AI models available across the whole platform
- Deactivate or restore any user account on the system

**When would you interact with the Platform Administrator?**

Most users will never need to think about this role. You would typically contact your Platform Administrator if you need something that goes beyond your organization — for example, if a user account needs to be deactivated at the system level, if you need a new AI model added to the platform, or if you need system-wide settings changed.

---

## Inviting Someone to Your Organization

You need to be an Owner or Admin to invite people. If you're a Member or Viewer, the invite section won't appear on the page.

1. Go to the Members page. You can find it in the sidebar navigation.
2. The page title reads "Organization Members."
3. Scroll down to the **Invite a New Member** section near the bottom of the page.
4. Type the person's email address in the "Email address" field.
5. Open the "Role" dropdown and choose the role you want to give them: Owner, Admin, Member, or Viewer.
6. Click **Send Invite** (or press Enter while in the email field).

The person will receive an email with a link to accept the invitation. That link is valid for 7 days.

While the invitation is pending, it shows up in the **Pending Invitations** table on the same page. You can see the email address, the role they were invited as, and when the invitation expires.

---

## Accepting an Invitation

1. Check your email for a message with the subject line about joining an organization.
2. Click the link in the email.
3. You'll be taken to the dashboard, where you'll see a prompt to accept or decline.
4. Click **Accept** to join the organization. Your membership is created right away.
5. Click **Decline** if you don't want to join. No membership is created, and the invitation is marked as declined.

Once you accept, you can sign in and start using the platform with the role you were assigned.

---

## Revoking a Pending Invitation

If you sent an invite to the wrong person, or you've changed your mind before they accept:

1. Go to the Members page.
2. Find the invitation in the **Pending Invitations** table.
3. Click the trash icon in the **Revoke** column on that row.
4. The invitation is cancelled immediately.

If the person tries to click the link in their email after you've revoked it, they'll see an error message and won't be able to join.

---

## Changing a Member's Role

1. Go to the Members page.
2. Find the person in the **Members** table.
3. In the **Change Role** column, open the dropdown next to their name.
4. Select the new role you want to assign.

The change takes effect right away. The next time that person does anything on the platform, they'll be operating under their new role.

One important limit: you cannot demote the last Owner to a lower role. If you try, you'll see a message that says something like "Can't remove the last owner." To work around this, promote another member to Owner first, then change the original Owner's role.

---

## Removing a Member

1. Go to the Members page.
2. Find the person in the **Members** table.
3. Click the red trash icon in the **Remove** column on their row.
4. Confirm the removal when prompted.

They're removed from the organization immediately. Their account still exists, so they can still sign in, but they won't see your organization or any of its data anymore. If you want them back later, you can re-invite them using the normal invitation flow.

The same last-Owner protection applies here: you cannot remove the only Owner. Promote someone else to Owner first.

---

## Deactivating a User Account

Deactivating an account is a system-level action, not something done through the dashboard. When an account is deactivated:

- The person's next request is blocked, even if they're currently signed in.
- Their data and task history are preserved.
- Reactivating the account restores full access immediately on their next request.

If you need to deactivate an account, contact your platform administrator.

---

## Tips and Common Questions

**"I sent an invite but the person didn't receive it."**
Ask them to check their spam or junk folder. Invitations expire after 7 days, so if it's been a while, you may need to send a new one.

**"I can't see the Invite section on the Members page."**
Only Owners and Admins can invite people. If you're a Member or Viewer, the section is hidden. Ask an Owner or Admin to send the invite on your behalf.

**"I accidentally removed someone."**
No problem. Go back to the Members page, scroll to the Invite section, and send them a new invitation. They'll get a fresh email and can rejoin with the same or a different role.

**"The role dropdown doesn't seem to be doing anything."**
Make sure you're an Owner or Admin. Members and Viewers see the table in read-only mode, so the dropdown won't respond to clicks.

**"I'm getting an error when I try to remove someone."**
If that person is the only Owner, the system won't let you remove them. First, promote another member to Owner, then come back and remove the original Owner.

**"I forgot which organization I'm looking at."**
The organization name is shown at the top of every page. You can also check the URL, which includes your organization's identifier.

**"Can I belong to more than one organization?"**
Yes. If you've been invited to multiple organizations, you can switch between them using the selector at the top of the page. Each organization's data is completely separate.
