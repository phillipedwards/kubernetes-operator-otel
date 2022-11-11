import * as kubernetes from "@pulumi/kubernetes";

export const createOtelResources = (region: string, provider: kubernetes.Provider) => {
    const name = "aws-otel-eks";
    const ns = new kubernetes.core.v1.Namespace(name, {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
            name: name,
            labels: {
                name: name,
            },
        },
    }, { provider });

    new kubernetes.apps.v1.Deployment(name, {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
            name: `${name}-sidecar`,
            namespace: ns.metadata.name,
            labels: {
                name: `${name}-sidecar`,
            },
        },
        spec: {
            replicas: 1,
            selector: {
                matchLabels: {
                    name: `${name}-sidecar`,
                },
            },
            template: {
                metadata: {
                    labels: {
                        name: `${name}-sidecar`,
                    },
                },
                spec: {
                    containers: [
                        {
                            name: "aws-otel-emitter",
                            image: "public.ecr.aws/aws-otel-test/aws-otel-java-spark:latest",
                            env: [
                                {
                                    name: "OTEL_OTLP_ENDPOINT",
                                    value: "localhost:4317",
                                },
                                {
                                    name: "OTEL_RESOURCE_ATTRIBUTES",
                                    value: "service.namespace=AWSObservability,service.name=CloudWatchEKSService",
                                },
                                {
                                    name: "S3_REGION",
                                    value: region,
                                },
                                {
                                    name: "OTEL_METRICS_EXPORTER",
                                    value: "otlp",
                                },
                            ],
                            imagePullPolicy: "Always",
                        },
                        {
                            name: "aws-otel-collector",
                            image: "amazon/aws-otel-collector:latest",
                            env: [{
                                name: "AWS_REGION",
                                value: region,
                            }],
                            imagePullPolicy: "Always",
                            resources: {
                                limits: {
                                    cpu: "256m",
                                    memory: "512Mi",
                                },
                                requests: {
                                    cpu: "32m",
                                    memory: "24Mi",
                                },
                            },
                        },
                    ],
                },
            },
        },
    }, { provider });
};