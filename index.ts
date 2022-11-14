// Copyright 2021, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "@pulumi/kubernetesx";
import * as eks from "@pulumi/eks";
import * as operator from "./operator";
import * as otel from "./otel";
import * as iam from "./iam";

const role = iam.createRole("node-group");

const cluster = new eks.Cluster("cluster", {
    publicSubnetIds: ["subnet-dc6b74f4", "subnet-2578356e"],
    desiredCapacity: 2,
    minSize: 2,
    maxSize: 2,
    deployDashboard: false,
    skipDefaultNodeGroup: true,
    instanceRole: role,
    enabledClusterLogTypes: [
        "api",
        "audit",
        "authenticator",
    ],
    vpcCniOptions: {
        disableTcpEarlyDemux: true,
    }
});

eks.createManagedNodeGroup("node-group", {
    cluster: cluster,
    nodeGroupName: "otel-ng",
    nodeRoleArn: role.arn
}, cluster);

// #############################################################################
// Deploy the Pulumi Kubernetes Operator

// By default, uses $HOME/.kube/config when no kubeconfig is set.
const provider = new k8s.Provider("k8s", {
    kubeconfig: cluster.kubeconfig
});

// Create the Pulumi Kubernetes Operator.
// Uses a custom ComponentResource class based on Typescript code in https://git.io/JJ6yj
const name = "pulumi-k8s-operator"
const pulumiOperator = new operator.PulumiKubernetesOperator(name, {
    namespace: "default",
    provider,
});

// #############################################################################
// Deploy AWS S3 Buckets

// Get the Pulumi API token and AWS creds.
const config = new pulumi.Config();
const awsConfig = new pulumi.Config("aws");

const pulumiAccessToken = config.requireSecret("pulumiAccessToken");

const awsAccessKeyId = config.require("awsAccessKeyId");
const awsSecretAccessKey = config.requireSecret("awsSecretAccessKey");
const awsSessionToken = config.requireSecret("awsSessionToken");

const stackName = config.require("stackName");
const stackProjectRepo = config.get("stackProjectRepo") || "https://github.com/joeduffy/test-s3-op-project";

// Create the creds as Kubernetes Secrets.
const accessToken = new kx.Secret("accesstoken", {
    stringData: { accessToken: pulumiAccessToken },
}, { provider });
const awsCreds = new kx.Secret("aws-creds", {
    stringData: {
        "AWS_ACCESS_KEY_ID": awsAccessKeyId,
        "AWS_SECRET_ACCESS_KEY": awsSecretAccessKey,
        "AWS_SESSION_TOKEN": awsSessionToken,
    },
}, { provider });

// Create an AWS S3 Pulumi Stack in Kubernetes.
const mystack = new k8s.apiextensions.CustomResource("my-stack", {
    apiVersion: 'pulumi.com/v1',
    kind: 'Stack',
    spec: {
        stack: stackName,
        projectRepo: stackProjectRepo,
        branch: "refs/heads/master",
        envRefs: {
            PULUMI_ACCESS_TOKEN:
            {
                type: "Secret",
                secret: {
                    name: accessToken.metadata.name,
                    key: "accessToken",
                },
            },
            AWS_ACCESS_KEY_ID: {
                type: "Secret",
                secret: {
                    name: awsCreds.metadata.name,
                    key: "AWS_ACCESS_KEY_ID",
                },
            },
            AWS_SECRET_ACCESS_KEY: {
                type: "Secret",
                secret: {
                    name: awsCreds.metadata.name,
                    key: "AWS_SECRET_ACCESS_KEY",
                },
            },
            AWS_SESSION_TOKEN: {
                type: "Secret",
                secret: {
                    name: awsCreds.metadata.name,
                    key: "AWS_SESSION_TOKEN",
                }
            }
        },
        config: {
            "aws:region": awsConfig.require("region"),
        },
        //destroyOnFinalize: true,
        continueResyncOnCommitMatch: true,
        resyncFrequencySeconds: 60,
    },
}, { dependsOn: pulumiOperator.deployment, provider });

//otel.createOtelResources(provider);

// new k8s.helm.v3.Release("otel", {
//     name: "adot-exporter-for-eks-on-ec2",
//     chart: "adot-exporter-for-eks-on-ec2",
//     repositoryOpts: {
//         repo: "https://aws-observability.github.io/aws-otel-helm-charts"
//     },
//     values: {
//         awsRegion: awsConfig.require("region"),
//         clusterName: cluster.eksCluster.name,
//     }
// }, { provider });

export const kubeconfig = cluster.kubeconfig;

/*
1063510016
1063907328
1063227392
993284096
*/