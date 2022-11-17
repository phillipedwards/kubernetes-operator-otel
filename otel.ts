import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

export const createInsights = (region: string, provider: kubernetes.Provider, clusterName: pulumi.Output<string>) => {
    const ns = new kubernetes.core.v1.Namespace("ns", {
        metadata: {
            name: "amazon-cloudwatch",
            labels: {
                "name": "amazon-cloudwatch"
            }
        }
    }, { provider: provider });

    const sa = new kubernetes.core.v1.ServiceAccount("sa", {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
            name: "cloudwatch-agent",
            namespace: "amazon-cloudwatch",
        },
    }, { provider: provider });

    const role = new kubernetes.rbac.v1.ClusterRole("role", {
        kind: "ClusterRole",
        apiVersion: "rbac.authorization.k8s.io/v1",
        metadata: {
            name: "cloudwatch-agent-role",
        },
        rules: [
            {
                apiGroups: [""],
                resources: [
                    "pods",
                    "nodes",
                    "endpoints",
                ],
                verbs: [
                    "list",
                    "watch",
                ],
            },
            {
                apiGroups: ["apps"],
                resources: ["replicasets"],
                verbs: [
                    "list",
                    "watch",
                ],
            },
            {
                apiGroups: ["batch"],
                resources: ["jobs"],
                verbs: [
                    "list",
                    "watch",
                ],
            },
            {
                apiGroups: [""],
                resources: ["nodes/proxy"],
                verbs: ["get"],
            },
            {
                apiGroups: [""],
                resources: [
                    "nodes/stats",
                    "configmaps",
                    "events",
                ],
                verbs: ["create"],
            },
            {
                apiGroups: [""],
                resources: ["configmaps"],
                resourceNames: ["cwagent-clusterleader"],
                verbs: [
                    "get",
                    "update",
                ],
            },
        ],
    }, { provider: provider });

    const roleBind = new kubernetes.rbac.v1.ClusterRoleBinding("bind", {
        kind: "ClusterRoleBinding",
        apiVersion: "rbac.authorization.k8s.io/v1",
        metadata: {
            name: "cloudwatch-agent-role-binding",
        },
        subjects: [{
            kind: "ServiceAccount",
            name: "cloudwatch-agent",
            namespace: "amazon-cloudwatch",
        }],
        roleRef: {
            kind: "ClusterRole",
            name: role.metadata.name,
            apiGroup: "rbac.authorization.k8s.io",
        },
    }, { provider: provider });

    const config = new kubernetes.core.v1.ConfigMap("config", {
        apiVersion: "v1",
        data: {
            "cwagentconfig.json": `{
                "logs": {
                    "metrics_collected": {
                        "kubernetes": {
                            "metrics_collection_interval": 60
                        }
                    },
                    "force_flush_interval": 5
                }
            }
    `,
        },
        kind: "ConfigMap",
        metadata: {
            name: "cwagentconfig",
            namespace: ns.metadata.name,
        },
    }, { provider: provider });

    new kubernetes.apps.v1.DaemonSet("daemon", {
        apiVersion: "apps/v1",
        kind: "DaemonSet",
        metadata: {
            name: "cloudwatch-agent",
            namespace: ns.metadata.name,
        },
        spec: {
            selector: {
                matchLabels: {
                    name: "cloudwatch-agent",
                },
            },
            template: {
                metadata: {
                    labels: {
                        name: "cloudwatch-agent",
                    },
                },
                spec: {
                    containers: [{
                        name: "cloudwatch-agent",
                        image: "amazon/cloudwatch-agent:1.247354.0b251981",
                        resources: {
                            limits: {
                                cpu: "200m",
                                memory: "200Mi",
                            },
                            requests: {
                                cpu: "200m",
                                memory: "200Mi",
                            },
                        },
                        env: [
                            {
                                name: "HOST_IP",
                                valueFrom: {
                                    fieldRef: {
                                        fieldPath: "status.hostIP",
                                    },
                                },
                            },
                            {
                                name: "HOST_NAME",
                                valueFrom: {
                                    fieldRef: {
                                        fieldPath: "spec.nodeName",
                                    },
                                },
                            },
                            {
                                name: "K8S_NAMESPACE",
                                valueFrom: {
                                    fieldRef: {
                                        fieldPath: "metadata.namespace",
                                    },
                                },
                            },
                            {
                                name: "CI_VERSION",
                                value: "k8s/1.3.11",
                            },
                        ],
                        volumeMounts: [
                            {
                                name: config.metadata.name,
                                mountPath: "/etc/cwagentconfig",
                            },
                            {
                                name: "rootfs",
                                mountPath: "/rootfs",
                                readOnly: true,
                            },
                            {
                                name: "dockersock",
                                mountPath: "/var/run/docker.sock",
                                readOnly: true,
                            },
                            {
                                name: "varlibdocker",
                                mountPath: "/var/lib/docker",
                                readOnly: true,
                            },
                            {
                                name: "containerdsock",
                                mountPath: "/run/containerd/containerd.sock",
                                readOnly: true,
                            },
                            {
                                name: "sys",
                                mountPath: "/sys",
                                readOnly: true,
                            },
                            {
                                name: "devdisk",
                                mountPath: "/dev/disk",
                                readOnly: true,
                            },
                        ],
                    }],
                    volumes: [
                        {
                            name: config.metadata.name,
                            configMap: {
                                name: config.metadata.name,
                            },
                        },
                        {
                            name: "rootfs",
                            hostPath: {
                                path: "/",
                            },
                        },
                        {
                            name: "dockersock",
                            hostPath: {
                                path: "/var/run/docker.sock",
                            },
                        },
                        {
                            name: "varlibdocker",
                            hostPath: {
                                path: "/var/lib/docker",
                            },
                        },
                        {
                            name: "containerdsock",
                            hostPath: {
                                path: "/run/containerd/containerd.sock",
                            },
                        },
                        {
                            name: "sys",
                            hostPath: {
                                path: "/sys",
                            },
                        },
                        {
                            name: "devdisk",
                            hostPath: {
                                path: "/dev/disk/",
                            },
                        },
                    ],
                    terminationGracePeriodSeconds: 60,
                    serviceAccountName: sa.metadata.name,
                },
            },
        },
    }, { provider: provider });

}