---
title: Glossary
sidebar_position: 99
---

# Glossary

## OIDC groups claim

An OpenID Connect claim, usually named `groups`, that contains the identity-provider groups assigned to the authenticated user. Cordum reads this claim for Okta-style RBAC onboarding when `CORDUM_OIDC_GROUPS_CLAIM` is configured.

## GroupRoleMapping

A Cordum OIDC configuration map from identity-provider group names to Cordum roles. Group keys are matched case-insensitively after trimming whitespace, values must be `admin`, `operator`, or `viewer`, and duplicate normalized group keys are rejected.

## Epic

A Cordum epic is a planning container for a coherent product outcome or major delivery stream. Epics group related tasks, carry architecture notes and rails that apply across those tasks, and let architects, workers, and QA track progress from backlog through review without granting the chat assistant any ability to mutate state.

## Task

A Cordum task is the executable unit of work inside an epic. A task has a definition of done, implementation steps, rails, worker assignment, review status, and QA history. Workers complete tasks by following the approved plan, running verification, recording evidence, and handing the task to QA for approval.
