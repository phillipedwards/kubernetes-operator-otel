import * as aws from "@pulumi/aws";
import { policy } from "@pulumi/kubernetes";

const managedPolicyArns: string[] = [
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
];

// Creates a role and attches the EKS worker node IAM managed policies
export function createRole(name: string): aws.iam.Role {
    const role = new aws.iam.Role(name, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
            Service: "ec2.amazonaws.com",
        }),
    });

    const otelPolicy = new aws.iam.Policy("otel", {
        policy: JSON.stringify({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "logs:PutLogEvents",
                        "logs:CreateLogGroup",
                        "logs:CreateLogStream",
                        "logs:DescribeLogStreams",
                        "logs:DescribeLogGroups",
                        "ssm:GetParameters"
                    ],
                    "Resource": "*"
                }
            ]
        })
    });

    let counter = 0;
    for (const policy of managedPolicyArns) {
        // Create RolePolicyAttachment without returning it.
        new aws.iam.RolePolicyAttachment(`${name}-policy-${counter++}`, {
            policyArn: policy,
            role: role
        });
    }

    new aws.iam.RolePolicyAttachment(`${name}-policy-otel`, {
        policyArn: otelPolicy.arn,
        role: role
    });

    return role;
}